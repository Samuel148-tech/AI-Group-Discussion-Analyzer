import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult } from "./src/types.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateAudioBackend(text: string, voiceName: string): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) return "";

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: trimmedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName as any },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      
      if (part?.inlineData?.data) {
        return part.inlineData.data;
      }
      
      attempts++;
      if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000));
    } catch (error: any) {
      console.error(`TTS backend failed:`, error);
      break;
    }
  }

  return "";
}

export async function analyzeTranscriptBackend(text: string, topic: string, title?: string): Promise<AnalysisResult> {
  if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set on the server.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash", // Using stable model for backend fallback or main
    contents: `Analyze the following transcript excerpt from a group discussion titled "${title || topic}" about the topic "${topic}".
    Transcript: "${text}"`,
    config: {
      systemInstruction: "You are an expert NLP analyzer for group discussions. Provide a detailed analysis in JSON format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          relevanceScore: { type: Type.NUMBER },
          coherenceScore: { type: Type.NUMBER },
          vocabularyRichness: { type: Type.NUMBER },
          fillerWordCount: { type: Type.INTEGER },
          fluencyScore: { type: Type.NUMBER },
          sentiment: { type: Type.STRING, enum: ["Positive", "Neutral", "Negative"] },
          confidence: { type: Type.NUMBER },
          assertiveness: { type: Type.NUMBER },
          politeness: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          sentimentTrend: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                score: { type: Type.NUMBER }
              },
              required: ["time", "score"]
            }
          }
        },
        required: ["relevanceScore", "coherenceScore", "vocabularyRichness", "fillerWordCount", "fluencyScore", "sentiment", "confidence", "assertiveness", "politeness", "summary", "suggestions", "sentimentTrend"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function getAIParticipantResponseBackend(context: string, topic: string, botName: string = "AI Participant"): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `You are "${botName}", an AI participant in a group discussion about "${topic}". 
      The discussion context is: "${context}"
      
      Your role is to:
      1. Acknowledge the points made by others.
      2. Share your unique perspective or ask a relevant question.
      3. Keep the conversation natural and engaging.
      
      Provide a brief, natural response (under 30 words). Do not include your name in the response.`,
      config: {
        systemInstruction: `You are ${botName}, a helpful and insightful AI participant. Your goal is to contribute meaningfully to the discussion while keeping it flowing.`
      }
    });
    const text = response.text?.trim() || "";
    return text || "I agree with that perspective. Let's explore it further.";
  } catch (error) {
    console.error("AI Response Backend Error:", error);
    return "That's a valid observation. I'd be interested to hear more thoughts on this.";
  }
}
