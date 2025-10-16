import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
  sendEmailVerification,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  deleteDoc,
  writeBatch,
  increment
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
    User, Agent, Member, NewMember, Broadcast, Post, NewPublicMemberData, MemberUser, 
    Conversation, Message, Report 
} from '../types';
import { generateAgentCode } from '../utils';
import { generateWelcomeMessage } from './geminiService';


const usersCollection = collection(db, 'users');
const membersCollection = collection(db, 'members');
const broadcastsCollection = collection(db, 'broadcasts');
const postsCollection = collection(db, 'posts');
const conversationsCollection = collection(db, 'conversations');
const reportsCollection = collection(db, 'reports');

const getUserProfile = async (uid: string): Promise<User | null> => {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() } as User;
    }
    return null;
};

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<User | null> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userProfile = await getUserProfile(userCredential.user.uid);
    if (userProfile?.status === 'ousted') {
        await signOut(auth);
        throw new Error("This account has been suspended.");
    }
    return userProfile;
  },

  logout: async (): Promise<void> => {
    await signOut(auth);
  },
  
  signup: async (name: string, email: string, password: string, circle: string): Promise<Agent> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { user } = userCredential;

    const newAgent: Agent = {
      id: user.uid,
      name,
      email,
      role: 'agent',
      circle,
      agent_code: generateAgentCode(),
      status: 'active',
      credibility_score: 100,
    };
    await setDoc(doc(usersCollection, user.uid), newAgent);
    return newAgent;
  },

  memberSignup: async (memberData: NewPublicMemberData, password: string): Promise<void> => {
    const userCredential = await createUserWithEmailAndPassword(auth, memberData.email, password);
    const permanentUser = userCredential.user;

    try {
        const newMemberDoc: Omit<Member, 'id'> = {
            full_name: memberData.full_name,
            phone: memberData.phone,
            email: memberData.email,
            circle: memberData.circle,
            address: memberData.address,
            national_id: memberData.national_id,
            registration_amount: 0,
            payment_status: 'pending_verification',
            agent_id: 'PUBLIC_SIGNUP',
            date_registered: new Date().toISOString(),
            membership_card_id: 'PENDING',
            welcome_message: 'Your registration is under review. Welcome to the community!',
            uid: permanentUser.uid,
        };
        const memberRef = await addDoc(membersCollection, newMemberDoc);

        const newUserProfile: MemberUser = {
            id: permanentUser.uid,
            name: memberData.full_name,
            email: memberData.email,
            role: 'member',
            member_id: memberRef.id,
            distress_calls_available: 0,
            status: 'pending',
            circle: memberData.circle,
            credibility_score: 100,
            phone: memberData.phone,
            address: memberData.address,
            id_card_number: memberData.national_id,
        };
        await setDoc(doc(usersCollection, permanentUser.uid), newUserProfile);
    } catch (dbError) {
        console.error("DB write failed after user creation:", dbError);
        // This error is critical. If the DB write fails, the user has an auth account
        // but no profile, effectively locking them out.
        throw new Error("Account created, but failed to save profile. Please contact support.");
    }
  },
   
  sendPasswordReset: (email: string): Promise<void> => {
      return sendPasswordResetEmail(auth, email);
  },

  // FIX: Added the missing sendVerificationEmail function
  sendVerificationEmail: async (): Promise<void> => {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
    } else {
      throw new Error("No user is currently signed in to send a verification email.");
    }
  },

  // User/Profile Management
  getUserProfile, // Expose the function

  getMemberByUid: async(uid: string): Promise<Member | null> => {
      const q = query(membersCollection, where("uid", "==", uid), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Member;
  },

  updateUser: async (uid: string, updatedData: Partial<User>): Promise<User> => {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, updatedData);
      const updatedDoc = await getDoc(userDocRef);
      return { id: updatedDoc.id, ...updatedDoc.data() } as User;
  },

  updateMemberProfile: async(memberId: string, updatedData: Partial<Member>): Promise<void> => {
      const memberDocRef = doc(db, 'members', memberId);
      await updateDoc(memberDocRef, updatedData);
  },

  // Agent actions
  registerMember: async (agent: Agent, memberData: NewMember): Promise<Member> => {
    const welcome_message = await generateWelcomeMessage(memberData.full_name, agent.circle);
    const newMember: Omit<Member, 'id'> = {
      ...memberData,
      agent_id: agent.id,
      agent_name: agent.name,
      date_registered: new Date().toISOString(),
      membership_card_id: `UGC-M-${Date.now()}`,
      welcome_message,
      uid: null,
    };
    const docRef = await addDoc(membersCollection, newMember);
    return { ...newMember, id: docRef.id };
  },

  getAgentMembers: async (agentId: string): Promise<Member[]> => {
    const q = query(membersCollection, where("agent_id", "==", agentId));
    const querySnapshot = await getDocs(q);
    const members = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
    members.sort((a, b) => new Date(b.date_registered).getTime() - new Date(a.date_registered).getTime());
    return members;
  },
  
  // Admin actions
  listenForAllUsers: (callback: (users: User[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(usersCollection, orderBy("name", "asc"));
      return onSnapshot(q,
        (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            callback(users);
        },
        (error) => {
            console.error("Firestore listener error (all users):", error);
            onError(error);
        }
      );
  },
  
  updateUserRole: async (uid: string, newRole: User['role']): Promise<void> => {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, { role: newRole });
  },

  listenForAllMembers: (callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(membersCollection, orderBy("date_registered", "desc"));
      return onSnapshot(q,
        (snapshot) => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            const emailCounts = members.reduce((acc, member) => {
                acc[member.email] = (acc[member.email] || 0) + 1;
                return acc;
            }, {} as {[key:string]: number});
            const membersWithDuplicates = members.map(member => ({ ...member, is_duplicate_email: emailCounts[member.email] > 1 }));
            callback(membersWithDuplicates);
        },
        (error) => {
            console.error("Firestore listener error (all members):", error);
            onError(error);
        }
      );
  },
  
  listenForPendingMembers: (callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(membersCollection, where("payment_status", "==", "pending_verification"));
      return onSnapshot(q, 
        (snapshot) => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            // Sort client-side to avoid needing a composite index
            members.sort((a, b) => new Date(a.date_registered).getTime() - new Date(b.date_registered).getTime());
            callback(members);
        },
        (error) => {
            console.error("Firestore listener error (pending members):", error);
            onError(error);
        }
      );
  },

  listenForAllAgents: (callback: (agents: Agent[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(usersCollection, where("role", "==", "agent"));
      return onSnapshot(q, 
        (snapshot) => {
            const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
            callback(agents);
        },
        (error) => {
            console.error("Firestore listener error (all agents):", error);
            onError(error);
        }
      );
  },

  approveMember: async (member: Member): Promise<void> => {
      const welcome_message = await generateWelcomeMessage(member.full_name, member.circle);
      const batch = writeBatch(db);

      const memberRef = doc(db, 'members', member.id);
      batch.update(memberRef, { 
          payment_status: 'complete', 
          welcome_message,
          membership_card_id: `UGC-M-${Date.now()}`
      });

      if (member.uid) {
        const userRef = doc(db, 'users', member.uid);
        batch.update(userRef, { status: 'active', distress_calls_available: 1 });
      }

      await batch.commit();
  },

  sendBroadcast: async (message: string): Promise<Broadcast> => {
    const newBroadcast: Omit<Broadcast, 'id'> = {
      message,
      date: new Date().toISOString(),
    };
    const docRef = await addDoc(broadcastsCollection, newBroadcast);
    return { ...newBroadcast, id: docRef.id };
  },

  getBroadcasts: async (): Promise<Broadcast[]> => {
    const q = query(broadcastsCollection, orderBy("date", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Broadcast));
  },
  
  updatePaymentStatus: async (memberId: string, status: Member['payment_status']): Promise<void> => {
      const memberDocRef = doc(db, 'members', memberId);
      await updateDoc(memberDocRef, { payment_status: status });
  },
  
  resetDistressQuota: async (uid: string): Promise<void> => {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { distress_calls_available: 1 });
  },
  
  clearLastDistressPost: async (uid: string): Promise<void> => {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as MemberUser;
      if (userData.last_distress_post_id) {
          const postRef = doc(db, 'posts', userData.last_distress_post_id);
          await deleteDoc(postRef);
          await updateDoc(userRef, { last_distress_post_id: null });
      }
  },

  // Member actions
  getMemberById: async (memberId: string): Promise<Member | null> => {
      const docRef = doc(db, 'members', memberId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as Member;
      }
      return null;
  },
  
  getMembersInCircle: async (circle: string): Promise<User[]> => {
      const q = query(
        usersCollection,
        where("circle", "==", circle),
        where("role", "==", "member"),
        where("status", "==", "active"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
  },
  
  listenForNewMembersInCircle: (circle: string, callback: (users: User[]) => void): () => void => {
    const q = query(
        usersCollection, 
        where("circle", "==", circle),
        where("role", "==", "member"),
        where("status", "==", "active"),
        limit(10)
    );
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        callback(users);
    });
  },

  createPost: async (author: User, content: string, type: Post['type']): Promise<void> => {
      const newPost: Omit<Post, 'id'> = {
          authorId: author.id,
          authorName: author.name,
          authorCircle: author.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          type,
      };
      await addDoc(postsCollection, newPost);
  },

  createDistressPost: async (content: string): Promise<User> => {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as MemberUser;
      
      if (userData.distress_calls_available <= 0) {
          throw new Error("No distress calls available.");
      }
      
      const newPost: Omit<Post, 'id'> = {
          authorId: userData.id,
          authorName: "Anonymous Member",
          authorCircle: userData.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          type: 'distress',
      };
      const postRef = await addDoc(postsCollection, newPost);

      await updateDoc(userRef, {
          distress_calls_available: userData.distress_calls_available - 1,
          last_distress_post_id: postRef.id
      });
      
      return await getUserProfile(currentUser.uid) as User;
  },

  listenForPosts: (filter: 'all' | 'proposals' | 'distress' | 'offers' | 'opportunities', callback: (posts: Post[]) => void): () => void => {
    if (filter === 'all') {
        const q = query(postsCollection, orderBy('date', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
            callback(posts);
        });
    } else {
        // For filtered queries, fetch by date and filter client-side.
        const q = query(postsCollection, orderBy('date', 'desc'), limit(200)); // Fetch more to find enough of a certain type
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Post))
                .filter(post => post.type === filter)
                .slice(0, 50);
            callback(posts);
        });
    }
  },

  getPostsByAuthor: async (authorId: string): Promise<Post[]> => {
    const q = query(postsCollection, where("authorId", "==", authorId), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
  },

  upvotePost: async (postId: string, userId: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
          const post = postDoc.data() as Post;
          if (post.upvotes.includes(userId)) {
              await updateDoc(postRef, { upvotes: arrayRemove(userId) });
          } else {
              await updateDoc(postRef, { upvotes: arrayUnion(userId) });
          }
      }
  },

  deletePost: async (postId: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      await deleteDoc(postRef);
  },
  
  deleteDistressPost: async (postId: string, authorId: string): Promise<void> => {
      const batch = writeBatch(db);

      // 1. Delete the post
      const postRef = doc(db, 'posts', postId);
      batch.delete(postRef);

      // 2. Check if this was the user's last distress post and clear it if so
      const userRef = doc(db, 'users', authorId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
          const userData = userDoc.data() as MemberUser;
          if (userData.last_distress_post_id === postId) {
              batch.update(userRef, { last_distress_post_id: null });
          }
      }
      
      await batch.commit();
  },

  updatePost: async (postId: string, content: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { content });
  },

  // Reporting
  reportPost: async (reporter: User, post: Post, reason: string, details: string): Promise<void> => {
    const newReport: Omit<Report, 'id'> = {
        reporterId: reporter.id,
        reporterName: reporter.name,
        postId: post.id,
        postAuthorId: post.authorId,
        postContent: post.content,
        reason,
        details,
        date: new Date().toISOString(),
        status: 'new',
    };
    await addDoc(reportsCollection, newReport);
  },

  listenForReports: (callback: (reports: Report[]) => void, onError: (error: Error) => void): () => void => {
    const q = query(reportsCollection, orderBy('date', 'desc'));
    return onSnapshot(q, 
        snapshot => {
            const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
            callback(reports);
        },
        error => {
            console.error("Firestore listener error (reports):", error);
            onError(error);
        }
    );
  },

  resolvePostReport: async (reportId: string, postId: string, authorId: string): Promise<void> => {
    const batch = writeBatch(db);

    // 1. Mark report as resolved
    const reportRef = doc(db, 'reports', reportId);
    batch.update(reportRef, { status: 'resolved' });

    // 2. Delete the post
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);

    // 3. Penalize the user
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, { credibility_score: increment(-25) });

    await batch.commit();

    // 4. Check if user should be ousted
    const updatedUserDoc = await getDoc(userRef);
    if (updatedUserDoc.exists()) {
        const userData = updatedUserDoc.data() as User;
        if ((userData.credibility_score || 0) <= 0) {
            await updateDoc(userRef, { status: 'ousted' });
        }
    }
  },
  
  dismissReport: async (reportId: string): Promise<void> => {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: 'resolved' });
  },

  // Chat
  getChatContacts: async (currentUser: User, forGroup: boolean = false): Promise<User[]> => {
    // Admins can contact anyone for 1-on-1 or group chats.
    if (currentUser.role === 'admin') {
      const snapshot = await getDocs(usersCollection);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as User))
        .filter(user => user.id !== currentUser.id);
    }
    
    // Members and Agents
    if (currentUser.role === 'member' || currentUser.role === 'agent') {
      // For groups, members/agents can only add other active members.
      if (forGroup) {
        const membersQuery = query(usersCollection, where('role', '==', 'member'), where('status', '==', 'active'));
        const membersSnap = await getDocs(membersQuery);
        return membersSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as User))
          .filter(user => user.id !== currentUser.id);
      }
      
      // For 1-on-1 chats, they can contact active members and admins.
      const membersQuery = query(usersCollection, where('role', '==', 'member'), where('status', '==', 'active'));
      const adminsQuery = query(usersCollection, where('role', '==', 'admin'));
      
      const [membersSnap, adminsSnap] = await Promise.all([getDocs(membersQuery), getDocs(adminsQuery)]);
      
      const members = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const admins = adminsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      
      const combined = [...members, ...admins];
      // Deduplicate and filter out self.
      const uniqueUsers = Array.from(new Map(combined.map(item => [item.id, item])).values());
      return uniqueUsers.filter(user => user.id !== currentUser.id);
    }
    
    // Default empty for any other case (e.g., pending members).
    return [];
  },
  
  listenForConversations: (userId: string, callback: (convos: Conversation[]) => void): () => void => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId));
      return onSnapshot(q, (snapshot) => {
          const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
          convos.sort((a, b) => {
              const timeA = a.lastMessageTimestamp?.toDate().getTime() || 0;
              const timeB = b.lastMessageTimestamp?.toDate().getTime() || 0;
              return timeB - timeA;
          });
          callback(convos);
      });
  },

  listenForMessages: (convoId: string, callback: (msgs: Message[]) => void): () => void => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      return onSnapshot(q, (snapshot) => {
          const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
          callback(messages);
      });
  },

  sendMessage: async (convoId: string, message: Omit<Message, 'id'|'timestamp'>): Promise<void> => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const timestamp = Timestamp.now();
      await addDoc(messagesRef, { ...message, timestamp });

      const convoRef = doc(db, 'conversations', convoId);
      await updateDoc(convoRef, {
          lastMessage: message.text,
          lastMessageSenderId: message.senderId,
          lastMessageTimestamp: timestamp,
          readBy: [message.senderId]
      });
  },
  
  startChat: async (userId1: string, userId2: string, userName1: string, userName2: string): Promise<Conversation> => {
      // First, query for existing conversation to avoid permission errors on getDoc for non-existent doc
      const q = query(
          conversationsCollection,
          where('members', 'array-contains', userId1),
          where('isGroup', '==', false)
      );

      const snapshot = await getDocs(q);
      let existingConvo: Conversation | null = null;
      
      snapshot.forEach(doc => {
          const convo = { id: doc.id, ...doc.data() } as Conversation;
          // Since it's not a group chat, it must have 2 members.
          if (convo.members.includes(userId2) && convo.members.length === 2) {
              existingConvo = convo;
          }
      });

      if (existingConvo) {
          return existingConvo;
      }

      // If not found, create a new one
      const members = [userId1, userId2].sort();
      const convoId = members.join('_'); // Use deterministic ID for creation
      const convoRef = doc(db, 'conversations', convoId);
      
      const newConvoData: Omit<Conversation, 'id'> = {
          isGroup: false,
          members,
          memberNames: { [userId1]: userName1, [userId2]: userName2 },
          lastMessage: 'Chat started.',
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: []
      };
      await setDoc(convoRef, newConvoData);
      return { id: convoId, ...newConvoData, lastMessageTimestamp: newConvoData.lastMessageTimestamp };
  },

  createGroupChat: async (name: string, memberIds: string[], memberNames: {[key: string]: string}): Promise<void> => {
      await addDoc(conversationsCollection, {
          isGroup: true,
          name,
          members: memberIds,
          memberNames,
          lastMessage: `${memberNames[memberIds[0]]} created the group.`,
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: []
      });
  },
  
  getGroupMembers: async (memberIds: string[]): Promise<MemberUser[]> => {
      if (memberIds.length === 0) return [];
      const q = query(usersCollection, where('__name__', 'in', memberIds));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({...d.data(), id: d.id}) as MemberUser);
  },
  
  updateGroupMembers: (convoId: string, memberIds: string[], memberNames: {[key: string]: string}): Promise<void> => {
      const convoRef = doc(db, 'conversations', convoId);
      return updateDoc(convoRef, { members: memberIds, memberNames });
  },

  leaveGroup: (convoId: string, userId: string): Promise<void> => {
      const convoRef = doc(db, 'conversations', convoId);
      return updateDoc(convoRef, { members: arrayRemove(userId) });
  },

};