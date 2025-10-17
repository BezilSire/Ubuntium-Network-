import React from 'react';
import { User } from '../types';
import { LogoIcon } from './icons/LogoIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOffIcon } from './icons/WifiOffIcon';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

const OfflineIndicator: React.FC = () => (
    <div className="flex items-center space-x-2 bg-slate-700 px-3 py-1 rounded-full text-xs font-medium text-gray-300">
        <WifiOffIcon className="h-4 w-4 text-gray-400" />
        <span>Offline</span>
    </div>
);

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const isOnline = useOnlineStatus();

  return (
    <header className="bg-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <LogoIcon className="h-10 w-10 text-green-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Ubuntium Global Commons</h1>
              <p className="text-xs text-green-400 italic">the commons protect those who protects the commons</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {!isOnline && <OfflineIndicator />}
            {user && (
              <div className="flex items-center space-x-4">
                <div className="hidden sm:flex items-center space-x-2">
                  <UserCircleIcon className="h-6 w-6 text-gray-400" />
                  <span className="text-gray-300 font-medium">{user.name}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
