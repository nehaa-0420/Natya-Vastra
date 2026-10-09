const { isPooled } = require('./availability');

function stockMap(db) {
  const map = new Map();
  for (const r of db.prepare('SELECT costume_id, size, qty FROM costume_stock ORDER BY size').all()) {
    if (!map.has(r.costume_id)) map.set(r.costume_id, []);
    map.get(r.costume_id).push({ size: r.size, qty: r.qty });
  }
  return map;
}

// Shape sent to the website for one costume.
function serializeCostume(row, stock = []) {
  const pooled = isPooled(stock);
  const total = stock.reduce((sum, s) => sum + s.qty, 0);
  const inStock = stock.filter((s) => s.qty > 0 && s.size > 0).map((s) => s.size);
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    src: row.image_path,
    name: row.name,
    designNo: row.sort_order + 1, // default title when no name is set: "<Category> · Design N"
    label: row.label,
    rentPrice: row.rent_price,
    sizeMin: pooled ? row.size_min : (inStock[0] ?? row.size_min),
    sizeMax: pooled ? row.size_max : (inStock[inStock.length - 1] ?? row.size_max),
    total: stock.length ? total : null,
    sizes: pooled ? [] : stock.filter((s) => s.size > 0).map((s) => ({ size: s.size, count: s.qty })),
    pooled,
    bookable: Boolean(row.active) && total > 0,
    active: Boolean(row.active)
  };
}

const COSTUME_SELECT = `SELECT c.*, cat.name AS category_name
                        FROM costumes c JOIN categories cat ON cat.id = c.category_id`;

module.exports = { stockMap, serializeCostume, COSTUME_SELECT };
