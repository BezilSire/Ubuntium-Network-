import React from 'react';
import { User } from '../types';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { UserPlusIcon } from './icons/UserPlusIcon';
import { UserCheckIcon } from './icons/UserCheckIcon';

interface UserCardProps {
  user: User;
  currentUser: User;
  onClick: () => void;
  onFollowToggle: (targetUserId: string, targetUserName: string) => void;
  isOnline?: boolean;
}

export const UserCard: React.FC<UserCardProps> = ({ user, currentUser, onClick, onFollowToggle, isOnline }) => {
  const isFollowing = currentUser.following?.includes(user.id);
  const isOwnProfile = currentUser.id === user.id;

  const handleFollowClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the main card's onClick from firing
    onFollowToggle(user.id, user.name);
  };

  return (
    <div
      onClick={onClick}
      className="w-full text-left bg-slate-800 p-4 rounded-lg shadow-md hover:bg-slate-700/50 hover:ring-2 hover:ring-green-500 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-center space-x-4">
        <div className="relative flex-shrink-0">
          <UserCircleIcon className="h-12 w-12 text-gray-400" />
          {isOnline && (
            <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-slate-800" title="Online"></span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{user.name}</p>
          <p className="text-sm text-gray-400 truncate">{user.circle}</p>
        </div>
        {!isOwnProfile && (
            <button 
                onClick={handleFollowClick}
                className={`flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors duration-200 ${isFollowing ? 'bg-green-800 text-green-300 hover:bg-green-900' : 'bg-green-600 text-white hover:bg-green-700'}`}
            >
                {isFollowing ? <UserCheckIcon className="h-4 w-4" /> : <UserPlusIcon className="h-4 w-4" />}
                <span>{isFollowing ? 'Following' : 'Follow'}</span>
            </button>
        )}
      </div>
      {user.bio && (
        <p className="text-xs text-gray-500 mt-3 line-clamp-2">
          {user.bio}
        </p>
      )}
    </div>
  );
};