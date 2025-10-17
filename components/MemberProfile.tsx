import React, { useState, useEffect } from 'react';
import { Member, User } from '../types';
import { api } from '../services/apiService';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { PencilIcon } from './icons/PencilIcon';
import { useToast } from '../contexts/ToastContext';
import { ProfileCompletionMeter } from './ProfileCompletionMeter';

interface MemberProfileProps {
  memberId: string;
  currentUserId: string; // The UID of the logged-in user
  onBack: () => void;
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
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

export const MemberProfile: React.FC<MemberProfileProps> = ({ memberId, currentUserId, onBack, onUpdateUser }) => {
    const [member, setMember] = useState<Member | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const { addToast } = useToast();

    const [editData, setEditData] = useState({
        full_name: '',
        phone: '',
        address: '',
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
                        full_name: fetchedMember.full_name || '',
                        phone: fetchedMember.phone || '',
                        address: fetchedMember.address || '',
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
        if (!member || !member.uid) {
            addToast("Could not save profile. User data is missing.", "error");
            return;
        }
        setIsLoading(true);
        try {
            const memberUpdateData: Partial<Member> = {
                full_name: editData.full_name,
                phone: editData.phone,
                address: editData.address,
                bio: editData.bio,
                profession: editData.profession,
                skills: editData.skills,
                awards: editData.awards,
                interests: editData.interests,
                passions: editData.passions,
                gender: editData.gender,
                age: editData.age,
            };
            
            const userUpdateData: Partial<User> = {
                name: editData.full_name,
                phone: editData.phone,
                address: editData.address,
                bio: editData.bio,
            };
            
            await Promise.all([
                api.updateMemberProfile(member.id, memberUpdateData),
                onUpdateUser(userUpdateData) // This updates 'users' collection and AuthContext
            ]);
            
            setMember(prev => prev ? { ...prev, ...memberUpdateData } : null);
            setIsEditing(false);
        } catch (error) {
            addToast("An error occurred while saving. Please try again.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !member) {
        return <div className="text-center p-10">Loading profile...</div>;
    }

    if (!member) {
        return <div className="text-center p-10">Member not found.</div>;
    }
    
    const skillsArray = (isEditing ? editData.skills : member.skills)?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interestsArray = (isEditing ? editData.interests : member.interests)?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const passionsArray = (isEditing ? editData.passions : member.passions)?.split(',').map(s => s.trim()).filter(Boolean) || [];

    const profileDataForMeter = isEditing ? editData : member;

    return (
        <div className="animate-fade-in">
            <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300 transition-colors">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
            </button>
            
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold text-white">{isEditing ? editData.full_name : member.full_name}</h2>
                        <p className="text-lg text-green-400">{isEditing ? editData.profession : member.profession || 'Community Member'}</p>
                        <p className="text-sm text-gray-400">{member.circle} • Joined {new Date(member.date_registered).toLocaleDateString()}</p>
                    </div>
                    {isOwnProfile && !isEditing && (
                        <button onClick={() => setIsEditing(true)} className="flex items-center space-x-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-md hover:bg-slate-600">
                            <PencilIcon className="h-4 w-4" />
                            <span>Edit Profile</span>
                        </button>
                    )}
                </div>

                {isOwnProfile && <ProfileCompletionMeter profileData={profileDataForMeter} role="member" />}

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
                         {member.awards && (
                             <div>
                                <h3 className="text-md font-semibold text-gray-300 mb-2">Awards & Recognitions</h3>
                                <p className="text-gray-300 whitespace-pre-wrap">{member.awards}</p>
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
                                <label htmlFor="full_name" className="block text-sm font-medium text-gray-300">Full Name</label>
                                <input type="text" name="full_name" id="full_name" value={editData.full_name} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone</label>
                                <input type="tel" name="phone" id="phone" value={editData.phone} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                            </div>
                         </div>
                          <div>
                                <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address</label>
                                <input type="text" name="address" id="address" value={editData.address} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm" />
                         </div>
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
                        <div>
                            <label htmlFor="awards" className="block text-sm font-medium text-gray-300">Awards & Recognitions</label>
                            <textarea name="awards" id="awards" rows={3} value={editData.awards} onChange={handleEditChange} className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white sm:text-sm"></textarea>
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
