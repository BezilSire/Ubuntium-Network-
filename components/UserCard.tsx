import React from 'react';
import { User } from '../types';
import { UserCircleIcon } from './icons/UserCircleIcon';

interface UserCardProps {
  user: User;
  onClick: () => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800 p-4 rounded-lg shadow-md hover:bg-slate-700/50 hover:ring-2 hover:ring-green-500 transition-all duration-200"
    >
      <div className="flex items-center space-x-4">
        <UserCircleIcon className="h-12 w-12 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{user.name}</p>
          <p className="text-sm text-gray-400 truncate">{user.circle}</p>
        </div>
      </div>
      {user.bio && (
        <p className="text-xs text-gray-500 mt-3 line-clamp-2">
          {user.bio}
        </p>
      )}
    </button>
  );
};
