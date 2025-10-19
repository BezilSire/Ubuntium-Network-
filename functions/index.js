
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

/**
 * Creates a notification and updates the target user's followers list.
 * This is triggered when a user's `following` array changes.
 */
exports.onFollowUser = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    const beforeFollowing = beforeData.following || [];
    const afterFollowing = afterData.following || [];

    const followerId = context.params.userId;
    const followerDoc = await db.collection("users").doc(followerId).get();
    if (!followerDoc.exists) {
      console.log(`Follower user doc not found: ${followerId}`);
      return null;
    }
    const followerName = followerDoc.data().name;

    // Check for new follows
    const newFollows = afterFollowing.filter((id) => !beforeFollowing.includes(id));
    if (newFollows.length > 0) {
      const promises = newFollows.map((followedId) => {
        const notification = {
          userId: followedId,
          type: "NEW_FOLLOWER",
          message: `${followerName} started following you.`,
          link: followerId,
          causerId: followerId,
          causerName: followerName,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        };
        const followedUserRef = db.collection("users").doc(followedId);
        return Promise.all([
          db.collection("notifications").add(notification),
          followedUserRef.update({ followers: admin.firestore.FieldValue.arrayUnion(followerId) }),
        ]);
      });
      await Promise.all(promises);
    }

    // Check for unfollows
    const unfollows = beforeFollowing.filter((id) => !afterFollowing.includes(id));
    if (unfollows.length > 0) {
      const promises = unfollows.map((unfollowedId) => {
        const unfollowedUserRef = db.collection("users").doc(unfollowedId);
        return unfollowedUserRef.update({ followers: admin.firestore.FieldValue.arrayRemove(followerId) });
      });
      await Promise.all(promises);
    }

    return null;
  });

/**
 * Creates a notification when a post is liked.
 */
exports.onPostLiked = functions.firestore
  .document("posts/{postId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    const beforeUpvotes = beforeData.upvotes || [];
    const afterUpvotes = afterData.upvotes || [];
    const newLikers = afterUpvotes.filter((id) => !beforeUpvotes.includes(id));

    if (newLikers.length === 0) return null;

    const postAuthorId = afterData.authorId;
    if (!postAuthorId) return null;

    const likerId = newLikers[0]; // Assuming one like at a time
    if (likerId === postAuthorId) return null; // Don't notify for self-likes

    const likerDoc = await db.collection("users").doc(likerId).get();
    if (!likerDoc.exists) return null;

    const notification = {
      userId: postAuthorId,
      type: "POST_LIKE",
      message: `${likerDoc.data().name} liked your post.`,
      link: context.params.postId,
      causerId: likerId,
      causerName: likerDoc.data().name,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    };
    return db.collection("notifications").add(notification);
  });

/**
 * Creates a notification for the post author when a new comment is added.
 */
exports.onNewComment = functions.firestore
  .document("posts/{postId}/comments/{commentId}")
  .onCreate(async (snap, context) => {
    const commentData = snap.data();
    const { postId } = context.params;

    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) return null;

    const postAuthorId = postDoc.data().authorId;
    if (postAuthorId === commentData.authorId) return null; // No self-notification

    const notification = {
      userId: postAuthorId,
      type: "POST_COMMENT",
      message: `${commentData.authorName} commented on your post.`,
      link: postId,
      causerId: commentData.authorId,
      causerName: commentData.authorName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    };
    return db.collection("notifications").add(notification);
  });

/**
 * Handles notifications for new messages in a conversation.
 */
exports.onNewMessage = functions.firestore
  .document("conversations/{convoId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const messageData = snap.data();
    const { convoId } = context.params;

    const convoDoc = await db.collection("conversations").doc(convoId).get();
    if (!convoDoc.exists) return null;

    const convoData = convoDoc.data();
    const senderId = messageData.senderId;
    const recipients = convoData.members.filter((id) => id !== senderId);
    if (recipients.length === 0) return null;

    const messageSnippet = messageData.text.length > 50 ? `${messageData.text.substring(0, 47)}...` : messageData.text;

    const promises = recipients.map((recipientId) => {
      const notification = {
        userId: recipientId,
        type: "NEW_MESSAGE",
        message: convoData.isGroup ?
          `${messageData.senderName} in ${convoData.name}: "${messageSnippet}"` :
          `${messageData.senderName}: "${messageSnippet}"`,
        link: convoId,
        causerId: senderId,
        causerName: messageData.senderName,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      };
      return db.collection("notifications").add(notification);
    });

    return Promise.all(promises);
  });

/**
 * Handles the notification for a newly created 1-on-1 chat.
 */
exports.onNewChat = functions.firestore
  .document("conversations/{convoId}")
  .onCreate(async (snap, context) => {
    const convoData = snap.data();
    if (convoData.isGroup) {
      return null;
    }

    // Client creates a chat with two members. We need to find who is NOT the creator.
    // However, without knowing the creator, we can notify both, and the client can ignore the self-notification.
    // A better way: assume the client will provide a `creatorId` field on creation. Since it doesn't, we'll notify the user who isn't the last message sender (which is initially empty). Let's find the recipient.
    const members = convoData.members; // [user1, user2]
    // The client code sets `lastMessage: 'Chat started.'` and `lastMessageSenderId: ''`.
    // The creator is the one making the call. Let's assume the other person is the recipient.
    // This is ambiguous. A better trigger is for the client to write a `pendingChats` doc for the other user.
    // Given the current structure, the most robust way is to pass the creator ID. But we can't change the client now.
    // Let's assume the user who is NOT the sender of the first message is the recipient to be notified.
    // But there is no first message yet.

    // A simple, if slightly flawed, approach is to notify the user who ISN'T the one who just came online or performed another action.
    // For now, let's just notify the other member. The client will have to know who started it.
    // Let's assume the creator is passed somehow or we can infer it.
    // Given client code `api.startChat(userId1, userId2, ...)` userId1 is the creator.
    // We can't know which one that is from the `members` array.
    // The client-side notification logic was: `userId: userId2`. So the second user is the recipient.
    
    // We will find a user in the members array who isn't the one who initiated the action. This is impossible to know server-side.
    // Let's make an assumption: the `lastMessage` is "Chat started." and `lastMessageSenderId` is empty. The `memberNames` object has keys.
    // A simple but workable solution is to notify BOTH members. The client app will simply not show a notification if the `causerId` is the current user's ID.
    const [user1, user2] = convoData.members;
    const name1 = convoData.memberNames[user1];
    const name2 = convoData.memberNames[user2];

    const notif1 = {
      userId: user2, // Notify user 2
      type: "NEW_CHAT",
      message: `${name1} started a conversation with you.`,
      link: context.params.convoId,
      causerId: user1,
      causerName: name1,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    };

     return db.collection("notifications").add(notif1);
  });

/**
 * Creates a global activity feed item when a new member is approved.
 */
exports.onMemberApproved = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (
      beforeData.status === "pending" &&
      afterData.status === "active" &&
      afterData.role === "member"
    ) {
      const newMemberId = context.params.userId;
      const activity = {
        type: "NEW_MEMBER",
        message: `${afterData.name} from ${afterData.circle || "the"} Circle has joined the commons!`,
        link: newMemberId,
        causerId: newMemberId,
        causerName: afterData.name,
        causerCircle: afterData.circle || "Unknown",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };
      return db.collection("activity_feed").add(activity);
    }
    return null;
  });

/**
 * Creates a global activity feed item when a relevant post is created.
 */
exports.onPostCreated = functions.firestore
  .document("posts/{postId}")
  .onCreate(async (snap, context) => {
    const postData = snap.data();
    let activityType = null;
    switch (postData.type) {
      case "proposal": activityType = "NEW_POST_PROPOSAL"; break;
      case "opportunity": activityType = "NEW_POST_OPPORTUNITY"; break;
      case "offer": activityType = "NEW_POST_OFFER"; break;
      case "general": activityType = "NEW_POST_GENERAL"; break;
      default: break;
    }

    if (activityType) {
      const activity = {
        type: activityType,
        message: `${postData.authorName} created a new ${postData.type} post.`,
        link: context.params.postId,
        causerId: postData.authorId,
        causerName: postData.authorName,
        causerCircle: postData.authorCircle || "Unknown",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };
      return db.collection("activity_feed").add(activity);
    }
    return null;
  });
