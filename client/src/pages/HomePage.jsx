import { useEffect, useState } from 'react';
import { getCategories, getGallery } from '../api.js';
import Hero from '../components/Hero.jsx';
import Collections from '../components/Collections.jsx';
import CategoryModal from '../components/CategoryModal.jsx';
import GallerySection from '../components/GallerySection.jsx';
import ContactSection from '../components/ContactSection.jsx';

export default function HomePage() {
  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [presetCostume, setPresetCostume] = useState('');

  useEffect(() => {
    getCategories().then(setCategories).catch((e) => setCatError(e.message)).finally(() => setCatLoading(false));
    getGallery().then(setGallery).catch((e) => setGalleryError(e.message)).finally(() => setGalleryLoading(false));
  }, []);

  const handleEnquire = (categoryName) => {
    setActiveCategory(null);
    setPresetCostume(categoryName);
    setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <>
      <Hero />
      <Collections categories={categories} loading={catLoading} error={catError} onSelect={setActiveCategory} />
      <GallerySection images={gallery} loading={galleryLoading} error={galleryError} />
      <ContactSection categories={categories} presetCostume={presetCostume} />
      <CategoryModal category={activeCategory} onClose={() => setActiveCategory(null)} onEnquire={handleEnquire} />
    </>
  );
}
