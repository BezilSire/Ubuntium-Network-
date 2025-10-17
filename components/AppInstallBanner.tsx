import React, { useState, useEffect } from 'react';
import { DownloadIcon } from './icons/DownloadIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { LogoIcon } from './icons/LogoIcon';

export const AppInstallBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the banner has been dismissed before
    const isDismissed = localStorage.getItem('appInstallBannerDismissed');
    
    // Detect if the user is on an Android device
    const isAndroid = /android/i.test(navigator.userAgent);

    if (!isDismissed && isAndroid) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('appInstallBannerDismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-lg bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-4 flex items-center space-x-4 animate-fade-in z-50">
      <LogoIcon className="h-10 w-10 text-green-500 flex-shrink-0" />
      <div className="flex-grow">
        <p className="font-bold text-white">Get the Ubuntium App</p>
        <p className="text-sm text-gray-300">For the best experience, install our Android app.</p>
      </div>
      <a
        href="/ubuntium-app.apk"
        download
        className="flex-shrink-0 inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500 text-sm"
      >
        <DownloadIcon className="h-4 w-4 mr-2" />
        Install
      </a>
      <button onClick={handleDismiss} className="flex-shrink-0 text-gray-400 hover:text-white" title="Dismiss">
        <XCircleIcon className="h-6 w-6" />
      </button>
    </div>
  );
};
