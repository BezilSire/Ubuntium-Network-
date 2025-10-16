

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateWelcomeMessage = async (memberName: string, circleName: string): Promise<string> => {
  try {
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
    // Re-throw the error to be handled by the caller, providing a more user-friendly message.
    throw new Error(`Failed to generate welcome message for ${memberName}. The AI service may be temporarily unavailable.`);
  }
};