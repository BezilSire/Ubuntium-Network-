import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { UserCard } from './UserCard';
import { LoaderIcon } from './icons/LoaderIcon';

interface CommunityPageProps {
  currentUser: User;
  onViewProfile: (userId: string | null) => void;
}

export const CommunityPage: React.FC<CommunityPageProps> = ({ currentUser, onViewProfile }) => {
  const [newMembers, setNewMembers] = useState<User[]>([]);
  const [circleMembers, setCircleMembers] = useState<User[]>([]);
  const [isLoadingNew, setIsLoadingNew] = useState(true);
  const [isLoadingCircle, setIsLoadingCircle] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    if (currentUser.circle) {
      // Fetch new members
      api.getNewMembersInCircle(currentUser.circle, currentUser.id)
        .then(setNewMembers)
        .catch(() => addToast("Could not load new members.", "error"))
        .finally(() => setIsLoadingNew(false));
      
      // Fetch all members in circle
      api.getMembersInSameCircle(currentUser.circle, currentUser.id)
        .then(setCircleMembers)
        .catch(() => addToast("Could not load members from your circle.", "error"))
        .finally(() => setIsLoadingCircle(false));
    } else {
        setIsLoadingNew(false);
        setIsLoadingCircle(false);
    }
  }, [currentUser.circle, currentUser.id, addToast]);
  
  if (!currentUser.circle) {
      return (
          <div className="text-center p-8 bg-slate-800 rounded-lg">
              <h2 className="text-xl font-semibold text-white">No Circle Assigned</h2>
              <p className="text-gray-400 mt-2">
                  Your profile doesn't have a circle assigned yet. Community discovery is based on your circle.
              </p>
          </div>
      );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Community</h1>
        <p className="text-lg text-gray-400">Discover and connect with members in your circle.</p>
      </div>
      
      {/* New Members Section */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">New Members in Your Circle</h2>
        {isLoadingNew ? (
             <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
        ) : newMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {newMembers.map(user => (
                    <UserCard key={user.id} user={user} onClick={() => onViewProfile(user.id)} />
                ))}
            </div>
        ) : (
            <p className="text-gray-500">No new members to show right now.</p>
        )}
      </section>

      {/* Explore Circle Section */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Active Members in Your Circle</h2>
         {isLoadingCircle ? (
             <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
        ) : circleMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {circleMembers.map(user => (
                    <UserCard key={user.id} user={user} onClick={() => onViewProfile(user.id)} />
                ))}
            </div>
        ) : (
            <p className="text-gray-500">It looks like you're the first one here!</p>
        )}
      </section>
    </div>
  );
};