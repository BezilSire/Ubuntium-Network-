

import { GoogleGenAI, Chat } from "@google/genai";

// Create a singleton instance that will be initialized on first use.
let aiInstance: GoogleGenAI | null = null;
let chat: Chat | null = null;

/**
 * Initializes and returns the GoogleGenAI client instance.
 * Throws an error if the API key is not available in the environment.
 */
const getAiClient = (): GoogleGenAI => {
  if (!aiInstance) {
    // This check makes the error explicit and debuggable for the developer.
    if (!process.env.API_KEY) {
      console.error("Gemini API key is not configured. Please set the API_KEY environment variable in your deployment settings.");
      throw new Error("Gemini API key is not configured.");
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiInstance;
};

/**
 * Initializes or re-initializes a chat session with optional history.
 * @param history A pre-existing chat history to provide context to the model.
 */
export const initializeChat = (history?: { role: string; parts: { text: string }[] }[]) => {
    const ai = getAiClient();
    chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        history: history,
        config: {
            systemInstruction: "You are a friendly and helpful assistant for the Ubuntium Global Commons platform. Answer questions about the community, its values ('ubuntu' - I am because we are), and how to use the app. Keep your responses concise, positive, and helpful."
        }
    });
};


export const getChatBotResponse = async (prompt: string): Promise<string> => {
    if (!chat) {
        // Fallback: if chat is not initialized, initialize it without history.
        initializeChat();
    }
    try {
        const response = await chat!.sendMessage({ message: prompt });
        const text = response.text.trim();
        if (!text) {
            throw new Error("I'm not sure how to respond to that. Could you try rephrasing?");
        }
        return text;
    } catch (error) {
        console.error("Error getting chat bot response:", error);
        // Reset chat on error so the user can start a fresh conversation.
        chat = null;
        throw new Error("Sorry, I'm having trouble connecting right now. Please close this chat and try again in a moment.");
    }
};

export const generateWelcomeMessage = async (memberName: string, circleName: string): Promise<string> => {
  try {
    const ai = getAiClient(); // Get or initialize the client.
    const prompt = `You are a welcoming community assistant for Ubuntium Global Commons. A new member named ${memberName} has just joined the ${circleName} Circle. Write a short, inspiring, and personal welcome message (2-3 sentences) for their digital membership card. The tone should be uplifting and reflect the spirit of 'ubuntu' - 'I am because we are'.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const message = response.text.trim();
    if (!message) {
      throw new Error("Gemini API returned an empty message.");
    }
    return message;
  } catch (error) {
    console.error("Error generating welcome message with Gemini:", error);
    // Let the user know the specific issue if the key is missing.
    if (error instanceof Error && error.message.includes("API key is not configured")) {
        throw new Error("The AI service is not configured. Please contact an administrator.");
    }
    // Re-throw a generic error for other issues.
    throw new Error(`Failed to generate welcome message for ${memberName}. The AI service may be temporarily unavailable.`);
  }
};
