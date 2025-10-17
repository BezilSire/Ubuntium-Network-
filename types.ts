import { Timestamp } from 'firebase/firestore';

// The base user structure, stored in the 'users' collection in Firestore.
export interface User {
  id: string; // Corresponds to Firebase Auth UID
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'member';
  password?: string; // Only used during signup, not stored
  circle?: string; // Can be on agent or member
  phone?: string;
  address?: string;
  id_card_number?: string;
  credibility_score?: number;
  status?: 'active' | 'pending' | 'suspended' | 'ousted';
  bio?: string;
  online?: boolean;
  lastSeen?: Timestamp;
}

// Agent-specific properties, extending the base User.
export interface Agent extends User {
  role: 'agent';
  agent_code: string;
  circle: string;
}

// Data structure for a registered member, stored in the 'members' collection.
export interface Member {
  id: string; // Firestore document ID
  full_name: string;
  phone: string;
  email: string;
  circle: string;
  registration_amount: number;
  payment_status: 'complete' | 'installment' | 'pending' | 'pending_verification' | 'rejected';
  agent_id: string;
  agent_name?: string;
  date_registered: string; // ISO string
  membership_card_id: string;
  welcome_message: string;
  uid?: string | null; // Firebase Auth UID, linked after account activation
  is_duplicate_email?: boolean;
  needs_welcome_update?: boolean; // Flag for deferred AI message generation
  // Fields for member profile
  bio?: string;
  profession?: string;
  skills?: string;
  awards?: string;
  interests?: string;
  passions?: string;
  gender?: string;
  age?: string;
  address?: string;
  national_id?: string;
  // Enriched data from 'users' collection for admin views
  status?: User['status'];
  distress_calls_available?: number;
}

// The user object for a logged-in member, combining User and some Member details.
export interface MemberUser extends User {
    role: 'member';
    member_id: string; // Document ID from the 'members' collection
    distress_calls_available: number;
    last_distress_post_id?: string | null;
    status: 'active' | 'pending' | 'suspended' | 'ousted';
    credibility_score: number;
}

// Simplified Admin type, extending User.
export interface Admin extends User {
    role: 'admin';
}

// Type for data when an agent registers a new member.
export interface NewMember {
  full_name: string;
  phone: string;
  email: string;
  circle: string;
  registration_amount: number;
  payment_status: 'complete' | 'installment';
}

// Type for data when a member signs up publicly.
export interface NewPublicMemberData {
  full_name: string;
  phone: string;
  email: string;
  circle: string;
  address: string;
  national_id: string;
}

// Structure for admin broadcasts.
export interface Broadcast {
  id: string;
  message: string;
  date: string; // ISO string
}

// Structure for posts in the community feed.
export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorCircle: string;
  content: string;
  date: string; // ISO string
  upvotes: string[]; // Array of user IDs
  type: 'general' | 'proposal' | 'offer' | 'distress' | 'opportunity';
}

// Structure for a chat conversation.
export interface Conversation {
    id: string;
    isGroup: boolean;
    name?: string; // Group name
    members: string[]; // Array of user IDs
    memberNames: { [key: string]: string };
    lastMessage: string;
    lastMessageSenderId: string;
    lastMessageTimestamp: Timestamp; // Firestore Timestamp
    readBy: string[];
}

// Structure for a single chat message.
export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: Timestamp; // Firestore Timestamp
}

// Structure for a report (for posts).
export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  postId: string;
  postAuthorId: string;
  postContent: string;
  reason: string;
  details: string;
  date: string; // ISO
  status: 'new' | 'resolved';
}

// Personal, user-specific notifications
export interface Notification {
  id: string;
  userId: string; // Recipient
  type: 'NEW_MESSAGE' | 'POST_LIKE' | 'NEW_CHAT';
  message: string;
  link: string; // convoId or postId
  causerId: string;
  causerName: string;
  timestamp: Timestamp;
  read: boolean;
}

// Global activity feed items
export interface Activity {
  id: string;
  type: 'NEW_MEMBER' | 'NEW_POST_PROPOSAL' | 'NEW_POST_OPPORTUNITY' | 'NEW_POST_GENERAL' | 'NEW_POST_OFFER';
  message: string;
  link: string; // userId or postId
  causerId: string;
  causerName: string;
  causerCircle: string;
  timestamp: Timestamp;
}

// Merged type for the UI
export type NotificationItem = (Notification & { itemType: 'notification' }) | (Activity & { itemType: 'activity' });