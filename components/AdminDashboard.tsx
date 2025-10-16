import React, { useState, useEffect, useMemo } from 'react';
import { Admin, Agent, Member, Broadcast, Report, User, MemberUser, Conversation } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { MemberList } from './MemberList';
import { Pagination } from './Pagination';
import { UsersIcon } from './icons/UsersIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { MegaphoneIcon } from './icons/MegaphoneIcon';
import { ConfirmationDialog } from './ConfirmationDialog';
import { ClockIcon } from './icons/ClockIcon';
import { VerificationModal } from './VerificationModal';
import { AlertTriangleIcon } from './icons/AlertTriangleIcon';
import { ReportsView } from './ReportsView';
import { AdminProfile } from './AdminProfile';
import { PostsFeed } from './PostsFeed';
import { ConnectPage } from './ConnectPage';
import { DownloadIcon } from './icons/DownloadIcon';
import { exportToCsv } from '../utils';
import { LayoutDashboardIcon } from './icons/LayoutDashboardIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { InboxIcon } from './icons/InboxIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { PublicProfile } from './PublicProfile';


const StatCard: React.FC<{ icon: React.ReactNode; title: string; value: string | number; description?: string; }> = ({ icon, title, value, description }) => (
  <div className="bg-slate-800 p-6 rounded-lg shadow-lg flex items-start h-full">
    <div className="flex-shrink-0 bg-slate-700 rounded-md p-3">{icon}</div>
    <div className="ml-4">
      <p className="text-sm font-medium text-gray-400 truncate">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
    </div>
  </div>
);

type AdminView = 'dashboard' | 'users' | 'feed' | 'connect' | 'reports' | 'profile';
type UserSubView = 'agents' | 'members' | 'roles';

interface AdminDashboardProps {
  user: Admin;
  broadcasts: Broadcast[];
  onSendBroadcast: (message: string) => Promise<void>;
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, broadcasts, onSendBroadcast, onUpdateUser }) => {
  const [view, setView] = useState<AdminView>('dashboard');
  const [userView, setUserView] = useState<UserSubView>('agents');
  
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [chatTarget, setChatTarget] = useState<Conversation | null>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<Record<string, string | null>>({});
  const { addToast } = useToast();

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [dialogState, setDialogState] = useState<{ isOpen: boolean; member: Member | null; action: 'reset' | 'clear' }>({ isOpen: false, member: null, action: 'reset' });
  const [roleChangeDialog, setRoleChangeDialog] = useState<{ isOpen: boolean; user: User | null; newRole: User['role'] | null }>({ isOpen: false, user: null, newRole: null });
  const [verificationModalState, setVerificationModalState] = useState<{ isOpen: boolean, member: Member | null }>({ isOpen: false, member: null });

  useEffect(() => {
    const handleError = (dataType: string, error: Error) => {
        console.error(`Error loading ${dataType}:`, error);
        const message = `Could not load ${dataType}. This is likely a Firestore security rule misconfiguration.`;
        addToast(message, 'error');
        setLoadErrors(prev => ({...prev, [dataType]: message}));
    };

    const unsubUsers = api.listenForAllUsers(setAllUsers, (e) => handleError('all users', e));
    const unsubMembers = api.listenForAllMembers(setMembers, (e) => handleError('members', e));
    const unsubAgents = api.listenForAllAgents(setAgents, (e) => handleError('agents', e));
    const unsubPending = api.listenForPendingMembers(setPendingMembers, (e) => handleError('pending members', e));
    const unsubReports = api.listenForReports(setReports, (e) => handleError('reports', e));
    
    setIsLoading(false);

    return () => {
        unsubUsers();
        unsubMembers();
        unsubAgents();
        unsubPending();
        unsubReports();
    };
  }, [addToast]);

  // Clear the initial chat target when navigating away from the connect page
  useEffect(() => {
    if (view !== 'connect') {
      setChatTarget(null);
    }
  }, [view]);
  
  const handleStartChat = async (targetUser: User) => {
    try {
        const newConvo = await api.startChat(user.id, targetUser.id, user.name, targetUser.name);
        setChatTarget(newConvo);
        setViewingProfileId(null); // Close profile if open
        setView('connect');
    } catch (error) {
        addToast("Failed to start chat.", "error");
    }
  };

  if (viewingProfileId) {
    return (
        <PublicProfile 
            userId={viewingProfileId} 
            currentUserId={user.id} 
            onBack={() => setViewingProfileId(null)} 
            onStartChat={(targetUserId) => {
                const targetUser = allUsers.find(u => u.id === targetUserId);
                if (targetUser) handleStartChat(targetUser);
            }}
            onViewProfile={setViewingProfileId}
        />
    );
  }

  const enrichedMembers = useMemo(() => {
    const userMap = new Map<string, User>(allUsers.map(u => [u.id, u]));
    return members.map(member => {
      if (member.uid) {
        const userProfile = userMap.get(member.uid) as MemberUser | undefined;
        if (userProfile) {
          return {
            ...member,
            status: userProfile.status,
            distress_calls_available: userProfile.distress_calls_available,
          };
        }
      }
      return member;
    });
  }, [members, allUsers]);
  
  const agentsWithStats = useMemo(() => {
    return agents.map(agent => {
      const agentMembers = members.filter(m => m.agent_id === agent.id);
      const memberCount = agentMembers.length;
      const commission = agentMembers
        .filter(m => m.payment_status === 'complete')
        .reduce((sum, member) => sum + member.registration_amount * 0.10, 0);
      return { ...agent, memberCount, commission };
    });
  }, [agents, members]);
  
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setIsSending(true);
    try {
      await onSendBroadcast(broadcastMessage);
      setBroadcastMessage('');
    } catch (error) {
       addToast('Failed to send broadcast.', 'error');
    } finally {
        setIsSending(false);
    }
  };

  const handleMarkComplete = async (member: Member) => {
    if (window.confirm(`Are you sure you want to mark ${member.full_name}'s payment as complete?`)) {
        try {
            await api.updatePaymentStatus(member.id, 'complete');
            addToast("Payment status updated.", "success");
        } catch {
            addToast("Failed to update payment status.", "error");
        }
    }
  };
  
   const handleResetQuota = async () => {
        if (!dialogState.member || !dialogState.member.uid) return;
        try {
            await api.resetDistressQuota(dialogState.member.uid);
            addToast(`Distress call quota has been reset for ${dialogState.member.full_name}.`, 'success');
        } catch {
            addToast("Failed to reset quota.", "error");
        }
        setDialogState({ isOpen: false, member: null, action: 'reset' });
    };

    const handleClearPost = async () => {
        if (!dialogState.member || !dialogState.member.uid) return;
        try {
            await api.clearLastDistressPost(dialogState.member.uid);
            addToast(`Last distress post has been cleared for ${dialogState.member.full_name}.`, 'success');
        } catch {
            addToast("Failed to clear post.", "error");
        }
        setDialogState({ isOpen: false, member: null, action: 'clear' });
    };

    const handleApproveMember = async (memberToApprove: Member) => {
        try {
            await api.approveMember(memberToApprove);
            addToast(`${memberToApprove.full_name} has been approved and welcomed.`, 'success');
            setVerificationModalState({ isOpen: false, member: null });
        } catch (error) {
            const msg = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Approval failed: ${msg}`, 'error');
            throw error;
        }
    }

    const handleRejectMember = async (memberToReject: Member) => {
        try {
            await api.rejectMember(memberToReject);
            addToast(`${memberToReject.full_name}'s registration has been rejected.`, 'info');
            setVerificationModalState({ isOpen: false, member: null });
        } catch (error) {
            const msg = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Rejection failed: ${msg}`, 'error');
            throw error;
        }
    }
    
    const handleRoleChangeRequest = (user: User, newRole: User['role']) => {
        setRoleChangeDialog({ isOpen: true, user, newRole });
    };

    const handleRoleChangeConfirm = async () => {
        const { user: userToUpdate, newRole } = roleChangeDialog;
        if (!userToUpdate || !newRole) return;
        
        try {
            await api.updateUserRole(userToUpdate.id, newRole);
            addToast(`${userToUpdate.name}'s role has been updated to ${newRole}.`, 'success');
        } catch {
            addToast('Failed to update user role.', 'error');
        }
        setRoleChangeDialog({ isOpen: false, user: null, newRole: null });
    };

    const handleDownloadAgents = () => {
        if (agentsWithStats.length === 0) {
            addToast('There are no agents to export.', 'info');
            return;
        }
        const dataToExport = agentsWithStats.map(({ name, email, agent_code, circle, memberCount, commission }) => ({
          name, 
          email, 
          agent_code, 
          circle, 
          member_count: memberCount, 
          total_commission: commission.toFixed(2)
        }));
        exportToCsv(`all-agents-report-${new Date().toISOString().split('T')[0]}.csv`, dataToExport);
        addToast('Agent data is being downloaded.', 'info');
    };
    
    const handleDownloadMembers = () => {
        if (enrichedMembers.length === 0) {
            addToast('There are no members to export.', 'info');
            return;
        }
        const dataToExport = enrichedMembers.map(({ welcome_message, ...rest }) => ({
            ...rest,
            agent_name: rest.agent_id === 'PUBLIC_SIGNUP' ? 'Self-Registered' : rest.agent_name
        }));
        exportToCsv(`all-members-${new Date().toISOString().split('T')[0]}.csv`, dataToExport);
        addToast('Member data is being downloaded.', 'info');
    };

    const newReportsCount = useMemo(() => reports.filter(r => r.status === 'new').length, [reports]);

    const filteredItems = useMemo(() => {
        let listToFilter: any[] = [];
        if (view === 'users') {
            if (userView === 'members') listToFilter = enrichedMembers;
            else if (userView === 'agents') listToFilter = agentsWithStats;
            else if (userView === 'roles') listToFilter = allUsers;
        }
        
        if (!searchQuery) return listToFilter;

        return listToFilter.filter(item =>
            (item.full_name || item.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [enrichedMembers, agentsWithStats, allUsers, searchQuery, view, userView]);

    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );
    
    const TabButton: React.FC<{label: string, count?: number, isActive: boolean, onClick: () => void, icon: React.ReactNode}> = ({ label, count, isActive, onClick, icon }) => (
        <button onClick={onClick} className={`${isActive ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} group inline-flex items-center whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>
            <span className="mr-2 h-5 w-5">{icon}</span>
            {label}
            {count !== undefined && count > 0 && <span className="ml-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>}
        </button>
    );

    const renderDashboardView = () => (
        <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<UsersIcon className="h-6 w-6 text-green-400" />} title="Total Members" value={members.length} />
                <StatCard icon={<BriefcaseIcon className="h-6 w-6 text-green-400" />} title="Total Agents" value={agents.length} />
                <button onClick={() => { setView('users'); setUserView('members'); setSearchQuery('pending_verification'); }} className="text-left w-full h-full">
                    <StatCard icon={<ClockIcon className="h-6 w-6 text-yellow-400" />} title="Pending Verification" value={pendingMembers.length} description="New member signups to approve." />
                </button>
                <button onClick={() => setView('reports')} className="text-left w-full h-full">
                    <StatCard icon={<AlertTriangleIcon className="h-6 w-6 text-red-400" />} title="New Reports" value={newReportsCount} description="Reports needing review."/>
                </button>
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-white mb-4">Send Broadcast</h3>
                    <form onSubmit={handleSendBroadcast}>
                        <textarea value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} rows={4} placeholder="Type your message to all users..." className="w-full bg-slate-700 p-2 rounded-md text-white focus:ring-green-500 focus:border-green-500"></textarea>
                        <button type="submit" disabled={isSending} className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-slate-500">
                            {isSending ? "Sending..." : "Send to All"}
                        </button>
                    </form>
                </div>
                 <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-white mb-4">Recent Broadcasts</h3>
                    <ul className="space-y-3 max-h-64 overflow-y-auto">
                        {broadcasts.slice(0, 5).map(b => (
                            <li key={b.id} className="border-b border-slate-700 pb-2">
                                <p className="text-sm text-gray-300">{b.message}</p>
                                <p className="text-xs text-gray-500 mt-1">{new Date(b.date).toLocaleDateString()}</p>
                            </li>
                        ))}
                    </ul>
                 </div>
            </div>
        </div>
    );

    const ErrorDisplay: React.FC<{ error: string | null }> = ({ error }) => {
        if (!error) return null;
        return (
            <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-center">
                <p className="font-bold text-red-200">Error Loading Data</p>
                <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
        )
    }

    const renderUsersView = () => (
        <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                 <div className="flex space-x-1 bg-slate-700 p-1 rounded-lg">
                    <button onClick={() => setUserView('agents')} className={`px-4 py-2 text-sm font-medium rounded-md ${userView === 'agents' ? 'bg-slate-900 text-white' : 'text-gray-300 hover:bg-slate-600'}`}>Agents</button>
                    <button onClick={() => setUserView('members')} className={`px-4 py-2 text-sm font-medium rounded-md ${userView === 'members' ? 'bg-slate-900 text-white' : 'text-gray-300 hover:bg-slate-600'}`}>Members</button>
                    <button onClick={() => setUserView('roles')} className={`px-4 py-2 text-sm font-medium rounded-md ${userView === 'roles' ? 'bg-slate-900 text-white' : 'text-gray-300 hover:bg-slate-600'}`}>Role Management</button>
                 </div>
                 <button onClick={userView === 'agents' ? handleDownloadAgents : handleDownloadMembers} className={`inline-flex items-center px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 ${userView === 'roles' && 'hidden'}`}>
                    <DownloadIcon className="h-4 w-4 mr-2" /> Download CSV
                 </button>
            </div>
            <input type="text" placeholder={`Search ${userView}...`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full max-w-sm bg-slate-700 p-2 rounded-md text-white mb-4" />
            
            {isLoading ? <p>Loading...</p> : (
                <>
                    {userView === 'agents' && (
                        loadErrors.agents ? <ErrorDisplay error={loadErrors.agents} /> :
                        <div className="flow-root">
                            <table className="min-w-full divide-y divide-slate-700">
                                <thead><tr><th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-300 sm:pl-0">Name</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Contact</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Circle</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Members</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Commission</th></tr></thead>
                                <tbody className="divide-y divide-slate-700">
                                    {(paginatedItems as (Agent & { memberCount: number, commission: number })[]).map(agent => (
                                        <tr key={agent.id}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-0">{agent.name}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{agent.email}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{agent.circle}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{agent.memberCount}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">${agent.commission.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {userView === 'members' && (
                        loadErrors.members ? <ErrorDisplay error={loadErrors.members} /> :
                        <MemberList members={(paginatedItems as Member[])} isAdminView onMarkAsComplete={handleMarkComplete} onResetQuota={(m) => setDialogState({isOpen: true, member: m, action: 'reset'})} onClearDistressPost={(m) => setDialogState({isOpen: true, member: m, action: 'clear'})} onSelectMember={(m) => m.payment_status === 'pending_verification' && setVerificationModalState({ isOpen: true, member: m })} onViewProfile={(uid) => setViewingProfileId(uid)} onStartChat={(user) => handleStartChat(user)}/>
                    )}
                    {userView === 'roles' && (
                         loadErrors['all users'] ? <ErrorDisplay error={loadErrors['all users']} /> :
                         <div className="flow-root">
                            <table className="min-w-full divide-y divide-slate-700">
                                <thead><tr><th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-300 sm:pl-0">Name</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Email</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Current Role</th><th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Change Role To</th></tr></thead>
                                <tbody className="divide-y divide-slate-700">
                                    {(paginatedItems as User[]).map(u => (
                                        <tr key={u.id}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-0">{u.name}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{u.email}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400 capitalize">{u.role}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                <select value={u.role} onChange={(e) => handleRoleChangeRequest(u, e.target.value as User['role'])} className="bg-slate-700 text-white rounded-md p-1 border border-slate-600 focus:ring-green-500 focus:border-green-500">
                                                    <option value="member">Member</option>
                                                    <option value="agent">Agent</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredItems.length} itemsPerPage={ITEMS_PER_PAGE} />
                </>
             )}
        </div>
    );

    const renderActiveView = () => {
        switch (view) {
            case 'dashboard': return renderDashboardView();
            case 'users': return renderUsersView();
            case 'feed': return <PostsFeed user={user} filter="all" isAdminView onViewProfile={setViewingProfileId} />;
            case 'connect': return <ConnectPage user={user} initialTarget={chatTarget} onViewProfile={setViewingProfileId} />;
            case 'reports': return <div className="bg-slate-800 p-6 rounded-lg shadow-lg">{loadErrors.reports ? <ErrorDisplay error={loadErrors.reports} /> : <ReportsView reports={reports} />}</div>;
            case 'profile': return <AdminProfile user={user} onUpdateUser={onUpdateUser} />;
            default: return renderDashboardView();
        }
    };

  return (
    <div className="space-y-8 animate-fade-in">
        <ConfirmationDialog isOpen={dialogState.isOpen} onClose={() => setDialogState({ isOpen: false, member: null, action: 'reset' })} onConfirm={dialogState.action === 'reset' ? handleResetQuota : handleClearPost} title={dialogState.action === 'reset' ? "Reset Quota?" : "Clear Last Post?"} message={`Are you sure you want to ${dialogState.action === 'reset' ? 'reset the monthly distress call quota' : 'clear the last distress post'} for ${dialogState.member?.full_name}? This action cannot be undone.`} confirmButtonText={dialogState.action === 'reset' ? "Reset Quota" : "Clear Post"} />
        <ConfirmationDialog isOpen={roleChangeDialog.isOpen} onClose={() => setRoleChangeDialog({ isOpen: false, user: null, newRole: null })} onConfirm={handleRoleChangeConfirm} title="Confirm Role Change" message={`Are you sure you want to change ${roleChangeDialog.user?.name}'s role to "${roleChangeDialog.newRole}"?`} confirmButtonText="Confirm Change" />
        {verificationModalState.member && (
            <VerificationModal 
                isOpen={verificationModalState.isOpen} 
                onClose={() => setVerificationModalState({isOpen: false, member: null})} 
                member={verificationModalState.member} 
                onApprove={handleApproveMember}
                onReject={handleRejectMember}
            />
        )}
      
        <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <div className="mt-4 border-b border-slate-700">
                <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto" aria-label="Tabs">
                    <TabButton label="Dashboard" icon={<LayoutDashboardIcon/>} isActive={view === 'dashboard'} onClick={() => setView('dashboard')} />
                    <TabButton label="Users" icon={<UsersIcon/>} isActive={view === 'users'} onClick={() => setView('users')} />
                    <TabButton label="Feed" icon={<MessageSquareIcon/>} isActive={view === 'feed'} onClick={() => setView('feed')} />
                    <TabButton label="Connect" icon={<InboxIcon/>} isActive={view === 'connect'} onClick={() => setView('connect')} />
                    <TabButton label="Reports" icon={<AlertTriangleIcon/>} count={newReportsCount} isActive={view === 'reports'} onClick={() => setView('reports')} />
                    <TabButton label="Profile" icon={<UserCircleIcon/>} isActive={view === 'profile'} onClick={() => setView('profile')} />
                </nav>
            </div>
        </div>

       <div className="mt-6">
            {renderActiveView()}
       </div>
    </div>
  );
};