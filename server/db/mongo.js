const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

let _isConnected = false;
const DATA_FILE = process.env.MONGO_DATA_FILE || path.join(__dirname, 'mongo_data.json');

// Memory/file-backed persistent store for offline development and isolated test suites
class DocumentStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {}; // collectionName -> array of documents
    this.load();
  }

  load() {
    if (this.filePath === ':memory:') {
      this.data = {};
      return;
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
      }
    } catch {
      this.data = {};
    }
  }

  save() {
    if (this.filePath === ':memory:') return;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[mongo-fallback] Could not save data file:', err.message);
    }
  }

  getCollection(name) {
    if (!this.data[name]) this.data[name] = [];
    return this.data[name];
  }

  reset() {
    this.data = {};
    this.save();
  }
}

const docStore = new DocumentStore(DATA_FILE);

function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

function matchesFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(val)) {
      const orMatched = val.some((sub) => matchesFilter(doc, sub));
      if (!orMatched) return false;
      continue;
    }
    if (key === '_id') {
      const docId = String(doc._id || doc.id);
      const targetId = String(val && val._id ? val._id : val);
      if (docId !== targetId) return false;
      continue;
    }
    const docVal = doc[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
      if ('$in' in val && Array.isArray(val.$in)) {
        if (!val.$in.map(String).includes(String(docVal))) return false;
        continue;
      }
      if ('$gte' in val && docVal < val.$gte) return false;
      if ('$lte' in val && docVal > val.$lte) return false;
      if ('$gt' in val && docVal <= val.$gt) return false;
      if ('$lt' in val && docVal >= val.$lt) return false;
      if ('$ne' in val && docVal === val.$ne) return false;
      continue;
    }
    if (val instanceof RegExp) {
      if (!val.test(String(docVal || ''))) return false;
      continue;
    }
    if (String(docVal) !== String(val)) return false;
  }
  return true;
}

function wrapDoc(raw, collectionName) {
  if (!raw) return null;
  const doc = cloneDoc(raw);
  Object.defineProperty(doc, 'save', {
    enumerable: false,
    value: async function () {
      doc.updatedAt = new Date().toISOString();
      const col = docStore.getCollection(collectionName);
      const idx = col.findIndex((item) => String(item._id) === String(doc._id));
      if (idx >= 0) {
        col[idx] = cloneDoc(doc);
      } else {
        col.push(cloneDoc(doc));
      }
      docStore.save();
      return wrapDoc(doc, collectionName);
    }
  });
  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    value: function () {
      return cloneDoc(doc);
    }
  });
  return doc;
}

// Creates an adapter model that seamlessly delegates to Mongoose when connected,
// or uses persistent file storage when offline.
function createAdaptiveModel(modelName, schema) {
  const collectionName = schema.options?.collection || `${modelName.toLowerCase()}s`;
  const MongooseModel = mongoose.models[modelName] || mongoose.model(modelName, schema);

  const adaptive = {
    schema,
    mongooseModel: MongooseModel,

    async create(data) {
      if (_isConnected) {
        return MongooseModel.create(data);
      }
      const col = docStore.getCollection(collectionName);
      const doc = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data
      };
      col.push(cloneDoc(doc));
      docStore.save();
      return wrapDoc(doc, collectionName);
    },

    find(filter = {}) {
      if (_isConnected) {
        return MongooseModel.find(filter);
      }
      const col = docStore.getCollection(collectionName);
      const matched = col.filter((item) => matchesFilter(item, filter));
      const res = matched.map((item) => wrapDoc(item, collectionName));
      // Return a thenable with chaining helpers: sort, limit, skip, lean, select
      return {
        _data: res,
        sort(sortArg) {
          if (sortArg && typeof sortArg === 'object') {
            const [k, dir] = Object.entries(sortArg)[0] || [];
            if (k) this._data.sort((a, b) => (dir < 0 ? (b[k] > a[k] ? 1 : -1) : (a[k] > b[k] ? 1 : -1)));
          }
          return this;
        },
        limit(n) {
          this._data = this._data.slice(0, n);
          return this;
        },
        skip(n) {
          this._data = this._data.slice(n);
          return this;
        },
        lean() {
          this._data = this._data.map((d) => d.toObject ? d.toObject() : cloneDoc(d));
          return this;
        },
        select() {
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve(this._data).then(resolve, reject);
        },
        catch(reject) {
          return Promise.resolve(this._data).catch(reject);
        }
      };
    },

    async findOne(filter = {}) {
      if (_isConnected) {
        return MongooseModel.findOne(filter);
      }
      const col = docStore.getCollection(collectionName);
      const item = col.find((d) => matchesFilter(d, filter));
      return item ? wrapDoc(item, collectionName) : null;
    },

    async findById(id) {
      if (_isConnected) {
        return MongooseModel.findById(id);
      }
      const col = docStore.getCollection(collectionName);
      const strId = String(id && id._id ? id._id : id);
      const item = col.find((d) => String(d._id) === strId || String(d.id) === strId);
      return item ? wrapDoc(item, collectionName) : null;
    },

    async findOneAndUpdate(filter, update, options = {}) {
      if (_isConnected) {
        return MongooseModel.findOneAndUpdate(filter, update, options);
      }
      const col = docStore.getCollection(collectionName);
      const idx = col.findIndex((d) => matchesFilter(d, filter));
      if (idx < 0) {
        if (options.upsert) {
          const created = await this.create({ ...filter, ...(update.$set || update) });
          return created;
        }
        return null;
      }
      const doc = cloneDoc(col[idx]);
      const updates = update.$set ? { ...update.$set } : { ...update };
      if (update.$push) {
        for (const [k, v] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[k])) doc[k] = [];
          doc[k].push(v);
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          doc[k] = (doc[k] || 0) + v;
        }
      }
      Object.assign(doc, updates);
      doc.updatedAt = new Date().toISOString();
      col[idx] = cloneDoc(doc);
      docStore.save();
      return wrapDoc(options.new ? doc : col[idx], collectionName);
    },

    async updateOne(filter, update, options = {}) {
      return this.findOneAndUpdate(filter, update, options);
    },

    async countDocuments(filter = {}) {
      if (_isConnected) {
        return MongooseModel.countDocuments(filter);
      }
      const col = docStore.getCollection(collectionName);
      return col.filter((d) => matchesFilter(d, filter)).length;
    },

    async deleteMany(filter = {}) {
      if (_isConnected) {
        return MongooseModel.deleteMany(filter);
      }
      const col = docStore.getCollection(collectionName);
      const remaining = col.filter((d) => !matchesFilter(d, filter));
      const deleted = col.length - remaining.length;
      docStore.data[collectionName] = remaining;
      docStore.save();
      return { deletedCount: deleted };
    }
  };

  return adaptive;
}

async function connectMongo(uri = process.env.MONGODB_URI) {
  if (_isConnected) return true;
  if (!uri) {
    _isConnected = false;
    return false;
  }
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000
    });
    _isConnected = true;
    console.log('[MongoDB] Connected to MongoDB via Mongoose successfully.');
    return true;
  } catch (err) {
    _isConnected = false;
    console.warn(`[MongoDB] Note: MongoDB connection skipped (${err.message}). Running with persistent store.`);
    return false;
  }
}

function isMongoConnected() {
  return _isConnected && mongoose.connection.readyState === 1;
}

function resetFallbackStore() {
  docStore.reset();
}

module.exports = {
  mongoose,
  connectMongo,
  isMongoConnected,
  createAdaptiveModel,
  docStore,
  resetFallbackStore
};
