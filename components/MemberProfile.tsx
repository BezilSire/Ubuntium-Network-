import React, { useState, useEffect } from 'react';
import { Member } from '../types';
import { api } from '../services/apiService';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { PencilIcon } from './icons/PencilIcon';
import { useToast } from '../contexts/ToastContext';

interface MemberProfileProps {
  memberId: string;
  currentUserId: string; // The UID of the logged-in user
  onBack: () => void;
}

const DetailItem: React.FC<{label: string, value: string | undefined, isMono?: boolean}> = ({label, value, isMono = false}) => (
    <div>
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className={`mt-1 text-white ${isMono ? 'font-mono' : ''}`}>{value || <span className="text-gray-500 italic">Not provided</span>}</dd>
    </div>
);

const Pill: React.FC<{text: string}> = ({ text }) => (
    <span className="inline-block bg-slate-700 rounded-full px-3 py-1 text-sm font-semibold text-gray-300 mr-2 mb-2">
        {text}
    </span>
);

export const MemberProfile: React.FC<MemberProfileProps> = ({ memberId, currentUserId, onBack }) => {
    const [member, setMember] = useState<Member | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const { addToast } = useToast();

    const [editData, setEditData] = useState({
        bio: '',
        profession: '',
        skills: '',
        awards: '',
        interests: '',
        passions: '',
        gender: '',
        age: '',
    });

    useEffect(() => {
        const fetchMember = async () => {
            setIsLoading(true);
            try {
                const fetchedMember = await api.getMemberById(memberId);
                setMember(fetchedMember);
                if (fetchedMember) {
                    setEditData({
                        bio: fetchedMember.bio || '',
                        profession: fetchedMember.profession || '',
                        skills: fetchedMember.skills || '',
                        awards: fetchedMember.awards || '',
                        interests: fetchedMember.interests || '',
                        passions: fetchedMember.passions || '',
                        gender: fetchedMember.gender || '',
                        age: fetchedMember.age || '',
                    });
                }
            } catch (error) {
                addToast("Could not load member profile.", "error");
            } finally {
                setIsLoading(false);
            }
        };
        fetchMember();
    }, [memberId, addToast]);

    const isOwnProfile = member?.uid === currentUserId;

    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setEditData({ ...editData, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        if (!member) return;
        setIsLoading(true);
        try {
            await api.updateMemberProfile(member.id, editData);
            setMember(prev => prev ? { ...prev, ...editData } : null);
            setIsEditing(false);
            addToast("Profile updated successfully!", "success");
        } catch (error) {
            addToast("Failed to update profile.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return <div className="text-center p-10">Loading profile...</div>;
    }

    if (!member) {
        return <div className="text-center p-10">Member not found.</div>;
    }
    
    const skillsArray = member.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interestsArray = member.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const passionsArray = member.passions?.split(',').map(s => s.trim()).filter(Boolean) || [];

    return (
        <div className="animate-fade-in">
            <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300 transition-colors">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
            </button>
            
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold text-white">{member.full_name}</h2>
                        <p className="text-lg text-green-400">{member.profession || 'Community Member'}</p>
                        <p className="text-sm text-gray-400">{member.circle} • Joined {new Date(member.date_registered).toLocaleDateString()}</p>
                    </div>
                    {isOwnProfile && !isEditing && (
                        <button onClick={() => setIsEditing(true)} className="flex items-center space-x-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-md hover:bg-slate-600">
                            <PencilIcon className="h-4 w-4" />
                            <span>Edit Profile</span>
                        </button>
                    )}
                </div>

                {!isEditing ? (
                    <div className="mt-6 space-y-6">
                         <div>
                            <h3 className="text-md font-semibold text-gray-300 border-b border-slate-700 pb-2 mb-2">About</h3>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm mt-4">
                                <DetailItem label="Gender" value={member.gender} />
                                <DetailItem label="Age" value={member.age} />
                            </dl>
                            {member.bio && <p className="text-gray-300 whitespace-pre-wrap mt-4">{member.bio}</p>}
                        </div>

                        {skillsArray.length > 0 && (
                             <div>
                                <h3 className="text-md font-semibold text-gray-300 mb-2">Skills</h3>
                                <div>{skillsArray.map(skill => <Pill key={skill} text={skill} />)}</div>
                            </div>
                        )}
                        {interestsArray.length > 0 && (
                             <div>
                                <h3 className="text-md font-semibold text-gray-300 mb-2">Interests</h3>
                                <div>{interestsArray.map(item => <Pill key={item} text={item} />)}</div>
                            </div>
                        )}
                        {passionsArray.length > 0 && (
                             <div>
                                <h3 className="text-md font-semibold text-gray-300 mb-2">Passions</h3>
                                <div>{passionsArray.map(item => <Pill key={item} text={item} />)}</div>
                            </div>
                        )}

                        <div>
                            <h3 className="text-md font-semibold text-gray-300 border-b border-slate-700 pb-2 mb-2">Contact & Details</h3>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm mt-4">
                                <DetailItem label="Email" value={member.email} />
                                <DetailItem label="Phone Number" value={member.phone} />
                                <DetailItem label="Address" value={member.address} />
                                <DetailItem label="National ID" value={member.national_id} isMono />
                            </dl>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="profession" className="block text-sm font-medium text-gray-300">Job / Profession</label>
                                <input type="text" name="profession" id="profession" value={editData.profession} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                            </div>
                        </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="gender" className="block text-sm font-medium text-gray-300">Gender</label>
                                <input type="text" name="gender" id="gender" value={editData.gender} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                            </div>
                             <div>
                                <label htmlFor="age" className="block text-sm font-medium text-gray-300">Age</label>
                                <input type="text" name="age" id="age" value={editData.age} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                            </div>
                        </div>
                         <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-gray-300">Bio</label>
                            <textarea name="bio" id="bio" rows={4} value={editData.bio} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm"></textarea>
                        </div>
                        <div>
                            <label htmlFor="skills" className="block text-sm font-medium text-gray-300">Skills (comma-separated)</label>
                            <input type="text" name="skills" id="skills" value={editData.skills} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                        </div>
                         <div>
                            <label htmlFor="interests" className="block text-sm font-medium text-gray-300">Interests (comma-separated)</label>
                            <input type="text" name="interests" id="interests" value={editData.interests} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                        </div>
                        <div>
                            <label htmlFor="passions" className="block text-sm font-medium text-gray-300">Passions (comma-separated)</label>
                            <input type="text" name="passions" id="passions" value={editData.passions} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                        </div>
                        <div className="flex justify-end space-x-3 pt-4">
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-slate-600 text-white text-sm rounded-md hover:bg-slate-500">Cancel</button>
                            <button onClick={handleSave} disabled={isLoading} className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-slate-500">{isLoading ? "Saving..." : "Save Changes"}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
