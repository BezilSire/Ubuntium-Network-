import React from 'react';
import { HomeIcon } from './icons/HomeIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { BellIcon } from './icons/BellIcon';
import { UserIcon } from './icons/UserIcon';

type ActiveView = 'feed' | 'connect' | 'notifications' | 'profile';

interface MemberBottomNavProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notificationCount: number;
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hasNotification?: boolean;
}> = ({ icon, label, isActive, onClick, hasNotification }) => (
  <button
    onClick={onClick}
    className={`relative flex-1 flex flex-col items-center justify-center py-2 transition-colors duration-200 h-16 rounded-lg ${isActive ? 'text-green-400 bg-slate-700' : 'text-gray-400 hover:text-white hover:bg-slate-700/50'}`}
  >
    <div className="h-6 w-6 mb-1">{icon}</div>
    <span className="text-xs truncate">{label}</span>
    {hasNotification && (
        <span className="absolute top-2 right-1/2 translate-x-4 block w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-slate-800"></span>
    )}
  </button>
);

export const MemberBottomNav: React.FC<MemberBottomNavProps> = ({ activeView, setActiveView, notificationCount }) => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 shadow-lg z-40">
      <nav className="max-w-xl mx-auto flex h-20 items-center justify-around px-2 space-x-1">
        <NavItem
            icon={<HomeIcon />}
            label="Feed"
            isActive={activeView === 'feed'}
            onClick={() => setActiveView('feed')}
        />
        <NavItem
            icon={<MessageSquareIcon />}
            label="Connect"
            isActive={activeView === 'connect'}
            onClick={() => setActiveView('connect')}
        />
        <NavItem
            icon={<BellIcon />}
            label="Notifications"
            isActive={activeView === 'notifications'}
            onClick={() => setActiveView('notifications')}
            hasNotification={notificationCount > 0}
        />
        <NavItem
            icon={<UserIcon />}
            label="Profile"
            isActive={activeView === 'profile'}
            onClick={() => setActiveView('profile')}
        />
      </nav>
    </footer>
  );
};