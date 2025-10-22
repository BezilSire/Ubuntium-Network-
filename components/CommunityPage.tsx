import React, { useState, useEffect } from 'react';
import { User, Broadcast } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { UserCard } from './UserCard';
import { LoaderIcon } from './icons/LoaderIcon';
import { ActivityFeed } from './ActivityFeed';
import { MegaphoneIcon } from './icons/MegaphoneIcon';

interface CommunityPageProps {
  currentUser: User;
  onViewProfile: (userId: string | null) => void;
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
  broadcasts: Broadcast[];
}

const BroadcastsSection: React.FC<{ broadcasts: Broadcast[] }> = ({ broadcasts }) => (
    <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
        <MegaphoneIcon className="h-5 w-5 mr-2 text-green-400"/>
        Admin Broadcasts
      </h3>
      {broadcasts.length > 0 ? (
        <ul className="space-y-4 max-h-64 overflow-y-auto">
          {broadcasts.slice(0, 5).map(b => (
            <li key={b.id} className="border-b border-slate-700 pb-3 last:border-b-0">
              <p className="text-sm text-gray-300">{b.message}</p>
              <p className="text-xs text-gray-500 mt-1">{new Date(b.date).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No recent broadcasts from admins.</p>
      )}
    </div>
);


export const CommunityPage: React.FC<CommunityPageProps> = ({ currentUser, onViewProfile, onUpdateUser, broadcasts }) => {
  const [newMembers, setNewMembers] = useState<User[]>([]);
  const [circleMembers, setCircleMembers] = useState<User[]>([]);
  const [exploreMembers, setExploreMembers] = useState<User[]>([]);
  const [isLoadingNew, setIsLoadingNew] = useState(true);
  const [isLoadingCircle, setIsLoadingCircle] = useState(true);
  const [isLoadingExplore, setIsLoadingExplore] = useState(true);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  useEffect(() => {
    setIsLoadingExplore(true);
    api.exploreMembers(currentUser.id, currentUser.circle)
        .then(setExploreMembers)
        .catch(() => addToast("Could not load members to explore.", "error"))
        .finally(() => setIsLoadingExplore(false));

    if (currentUser.circle) {
      // Fetch new members
      setIsLoadingNew(true);
      api.getNewMembersInCircle(currentUser.circle, currentUser.id)
        .then(setNewMembers)
        .catch(() => addToast("Could not load new members.", "error"))
        .finally(() => setIsLoadingNew(false));
      
      // Fetch all members in circle
      setIsLoadingCircle(true);
      api.getMembersInSameCircle(currentUser.circle, currentUser.id)
        .then(setCircleMembers)
        .catch(() => addToast("Could not load members from your circle.", "error"))
        .finally(() => setIsLoadingCircle(false));
    } else {
        setIsLoadingNew(false);
        setIsLoadingCircle(false);
    }
  }, [currentUser.circle, currentUser.id, addToast]);
  
  // Listen for presence status of all displayed users
  useEffect(() => {
    const allMemberIds = [
        ...newMembers.map(u => u.id), 
        ...circleMembers.map(u => u.id),
        ...exploreMembers.map(u => u.id)
    ].filter((id): id is string => !!id);

    const uniqueIds = [...new Set(allMemberIds)];

    if (uniqueIds.length > 0) {
        const unsubscribe = api.listenForUsersPresence(uniqueIds, (statuses) => {
            setOnlineStatuses(prev => ({ ...prev, ...statuses }));
        });
        return () => unsubscribe();
    }
  }, [newMembers, circleMembers, exploreMembers]);
  
  const handleFollowToggle = async (targetUserId: string, targetUserName: string) => {
    const isCurrentlyFollowing = currentUser.following?.includes(targetUserId);

    try {
      if (isCurrentlyFollowing) {
        await api.unfollowUser(currentUser.id, targetUserId);
        addToast(`Unfollowed ${targetUserName}`, 'info');
      } else {
        await api.followUser(currentUser.id, targetUserId);
        addToast(`You are now following ${targetUserName}`, 'success');
      }
    } catch (error) {
      addToast('Action failed. Please try again.', 'error');
    }
  };

  const sortMembers = (members: User[]): User[] => {
    return [...members].sort((a, b) => {
        const aIsOnline = onlineStatuses[a.id] || false;
        const bIsOnline = onlineStatuses[b.id] || false;
        if (aIsOnline === bIsOnline) {
            return 0; // Keep original order if online status is the same
        }
        return aIsOnline ? -1 : 1;
    });
  };

  const renderUserGrid = (users: User[]) => (
     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortMembers(users).map(user => (
            <UserCard 
                key={user.id} 
                user={user}
                currentUser={currentUser}
                onClick={() => onViewProfile(user.id)}
                onFollowToggle={handleFollowToggle}
                isOnline={onlineStatuses[user.id]} 
            />
        ))}
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Community</h1>
        <p className="text-lg text-gray-400">Discover and connect with members in the commons.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            {/* New Members Section */}
            {currentUser.circle && (
                <section>
                <h2 className="text-xl font-semibold text-white mb-4">New Members in Your Circle</h2>
                {isLoadingNew ? (
                    <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
                ) : newMembers.length > 0 ? (
                    renderUserGrid(newMembers)
                ) : (
                    <p className="text-gray-500">No new members to show right now.</p>
                )}
                </section>
            )}

            {/* Explore Members Section */}
            <section>
                <h2 className="text-xl font-semibold text-white mb-4">Explore Other Members</h2>
                {isLoadingExplore ? (
                    <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
                ) : exploreMembers.length > 0 ? (
                    renderUserGrid(exploreMembers)
                ) : (
                    <p className="text-gray-500">Could not find any members to explore at this time.</p>
                )}
            </section>
            
            {/* All Members in Circle Section */}
            {currentUser.circle && (
                <section>
                <h2 className="text-xl font-semibold text-white mb-4">All Members in Your Circle</h2>
                {isLoadingCircle ? (
                    <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
                ) : circleMembers.length > 0 ? (
                    renderUserGrid(circleMembers)
                ) : (
                    <p className="text-gray-500">It looks like you're the first one here!</p>
                )}
                </section>
            )}
        </div>
        
        <aside className="lg:col-span-1 space-y-6">
            <BroadcastsSection broadcasts={broadcasts} />
            <section>
                <h2 className="text-xl font-semibold text-white mb-4">Recent Activity in Your Circle</h2>
                <ActivityFeed user={currentUser} onViewProfile={onViewProfile} />
            </section>
        </aside>
      </div>
    </div>
  );
};
