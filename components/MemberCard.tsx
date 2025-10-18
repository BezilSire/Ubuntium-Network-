import React from 'react';
import { Member, User } from '../types';
import { LogoIcon } from './icons/LogoIcon';

interface MemberCardProps {
  user: User;
  memberDetails: Member;
}

export const MemberCard: React.FC<MemberCardProps> = ({ user, memberDetails }) => {
  return (
    <div className="aspect-[1.586/1] w-full max-w-md mx-auto bg-slate-900 rounded-2xl p-6 shadow-2xl border border-yellow-500/30 flex flex-col justify-between relative overflow-hidden animate-fade-in">
        {/* Background gradient effect */}
        <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-br from-slate-800 via-slate-900 to-black -z-10"></div>
        
        {/* Header */}
        <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
                <LogoIcon className="h-10 w-10 text-yellow-400" />
                <div>
                    <h2 className="text-lg font-bold text-white tracking-wider">UBUNTIUM</h2>
                    <p className="text-xs text-yellow-400/80 tracking-widest">GLOBAL COMMONS</p>
                </div>
            </div>
            <p className="font-mono text-xs text-slate-500">MEMBER</p>
        </div>

        {/* Body */}
        <div className="flex-grow flex flex-col justify-center items-center text-center">
            <h1 className="text-3xl font-bold text-white">{user.name}</h1>
            <p className="mt-1 text-yellow-400 font-semibold">{memberDetails.circle} Circle</p>
        </div>

        {/* Footer */}
        <div className="text-center">
            <p className="text-sm italic text-slate-300">"{memberDetails.welcome_message}"</p>
            <div className="mt-4 flex justify-between items-end font-mono text-xs text-slate-400">
                <span>ID: {memberDetails.membership_card_id}</span>
                <span>Joined: {new Date(memberDetails.date_registered).toLocaleDateString()}</span>
            </div>
        </div>
    </div>
  );
};
