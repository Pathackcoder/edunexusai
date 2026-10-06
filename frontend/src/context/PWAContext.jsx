import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '../components/common/Toast';

const PWAContext = createContext(null);

export const PWAProvider = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [platform, setPlatform] = useState('other');

  // Check standalone mode (already installed & running as PWA)
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(isStandaloneMode);
    };

    checkStandalone();

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleModeChange = (e) => setIsInstalled(e.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleModeChange);
    } else {
      mediaQuery.addListener(handleModeChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleModeChange);
      } else {
        mediaQuery.removeListener(handleModeChange);
      }
    };
  }, []);

  // Detect client platform
  useEffect(() => {
    const userAgent = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent) && !window.MSStream) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    } else if (/edg/.test(userAgent)) {
      setPlatform('edge');
    } else if (/chrome|crios/.test(userAgent)) {
      setPlatform('chrome');
    } else if (/safari/.test(userAgent)) {
      setPlatform('safari');
    } else {
      setPlatform('other');
    }
  }, []);

  // Capture beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent automatic mini-infobar in mobile Chrome
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsModalOpen(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Trigger PWA install
  const promptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // If browser doesn't support beforeinstallprompt (e.g. iOS Safari, or already installed/standalone)
      setIsModalOpen(true);
    }
  };

  const openInstallModal = () => setIsModalOpen(true);
  const closeInstallModal = () => setIsModalOpen(false);

  return (
    <PWAContext.Provider
      value={{
        deferredPrompt,
        canNativeInstall: !!deferredPrompt,
        isInstalled,
        isModalOpen,
        platform,
        promptInstall,
        openInstallModal,
        closeInstallModal
      }}
    >
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
};
