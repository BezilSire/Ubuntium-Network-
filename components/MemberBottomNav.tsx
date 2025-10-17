import React from 'react';
import { HomeIcon } from './icons/HomeIcon';
import { SearchIcon } from './icons/SearchIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { HeartIcon } from './icons/HeartIcon';
import { UserIcon } from './icons/UserIcon';

type ActiveTab = 'home' | 'search' | 'activity' | 'profile';

interface MemberBottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onNewPostClick: () => void;
  notificationCount: number;
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  hasNotification?: boolean;
}> = ({ icon, isActive, onClick, hasNotification }) => (
  <button
    onClick={onClick}
    className={`relative flex-1 flex justify-center items-center py-2 transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-500 hover:text-white'}`}
  >
    <div className="h-7 w-7">{icon}</div>
    {hasNotification && (
        <span className="absolute top-2 right-1/2 translate-x-4 block w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-black"></span>
    )}
  </button>
);

export const MemberBottomNav: React.FC<MemberBottomNavProps> = ({ activeTab, setActiveTab, onNewPostClick, notificationCount }) => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-black border-t border-slate-800 shadow-lg z-40">
      <nav className="max-w-xl mx-auto flex h-16 px-2">
        <NavItem
            icon={<HomeIcon />}
            isActive={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
        />
        <NavItem
            icon={<SearchIcon />}
            isActive={activeTab === 'search'}
            onClick={() => setActiveTab('search')}
        />
        <button
          onClick={onNewPostClick}
          className="flex-1 flex justify-center items-center py-2 text-gray-500 hover:text-white"
        >
          <PlusCircleIcon className="h-7 w-7" />
        </button>
        <NavItem
            icon={<HeartIcon />}
            isActive={activeTab === 'activity'}
            onClick={() => setActiveTab('activity')}
            hasNotification={notificationCount > 0}
        />
        <NavItem
            icon={<UserIcon />}
            isActive={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
        />
      </nav>
    </footer>
  );
};
