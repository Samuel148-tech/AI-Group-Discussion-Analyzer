import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult, SessionConfig, TranscriptSegment, Participant, SessionMetrics } from "../types";

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. AI features will not work.");
}
const ai = new GoogleGenAI({ apiKey });

export async function generateAudio(text: string, voiceName: string): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText || !apiKey) return "";

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
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
      
      if (part?.text) {
        console.warn("TTS model returned text instead of audio:", part.text);
      }

      attempts++;
      if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000));
    } catch (error: any) {
      const status = error?.status || (error as any)?.error?.status;
      const code = error?.code || (error as any)?.error?.code;
      const message = error?.message || (error as any)?.error?.message;

      console.error(`TTS Attempt ${attempts + 1} failed: ${status} (${code}) - ${message}`);

      // Retry on 429 (Quota) or 500 (Internal)
      if ((code === 429 || code === 500 || status === "RESOURCE_EXHAUSTED" || status === "INTERNAL") && attempts < maxAttempts - 1) {
        attempts++;
        const delay = (code === 429 || status === "RESOURCE_EXHAUSTED") ? 2000 : 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      break;
    }
  }

  return "";
}

export async function analyzeTranscript(text: string, topic: string, title?: string): Promise<AnalysisResult> {
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: `Analyze the following transcript excerpt from a group discussion titled "${title || topic}" about the topic "${topic}".
    Transcript: "${text}"`,
    config: {
      systemInstruction: "You are an expert NLP analyzer for group discussions. Provide a detailed analysis in JSON format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          relevanceScore: { type: Type.NUMBER, description: "0-100 score of how relevant the text is to the topic" },
          coherenceScore: { type: Type.NUMBER, description: "0-100 score of logical flow and structural integrity" },
          vocabularyRichness: { type: Type.NUMBER, description: "0-100 score of lexical diversity and complexity" },
          fillerWordCount: { type: Type.INTEGER, description: "Count of filler words like 'um', 'ah', 'like', 'you know'" },
          fluencyScore: { type: Type.NUMBER, description: "0-100 score of speaking flow and rhythm" },
          sentiment: { type: Type.STRING, enum: ["Positive", "Neutral", "Negative"] },
          confidence: { type: Type.NUMBER, description: "0-100 score of perceived confidence and vocal presence" },
          assertiveness: { type: Type.NUMBER, description: "0-100 score of assertiveness and leadership" },
          politeness: { type: Type.NUMBER, description: "0-100 score of politeness and cooperative tone" },
          summary: { type: Type.STRING, description: "A concise behavioral summary of the participant's contribution" },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Personalized improvement recommendations" },
          sentimentTrend: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING, description: "Time point (e.g., 'Start', 'Middle', 'End')" },
                score: { type: Type.NUMBER, description: "Sentiment score at this point (0-100)" }
              },
              required: ["time", "score"]
            },
            description: "Temporal sentiment trends throughout the discussion"
          }
        },
        required: ["relevanceScore", "coherenceScore", "vocabularyRichness", "fillerWordCount", "fluencyScore", "sentiment", "confidence", "assertiveness", "politeness", "summary", "suggestions", "sentimentTrend"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    // Remove markdown code blocks if present
    const cleanText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse analysis JSON", e, response.text);
    throw new Error("Invalid analysis response format");
  }
}

export async function getAIParticipantResponse(context: string, topic: string, botName: string = "AI Participant"): Promise<string> {
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
    if (text.toLowerCase().includes("i cannot") || text.toLowerCase().includes("i'm sorry")) {
      return "That's an interesting point. How would everyone else describe this situation?";
    }
    return text || "I agree with that perspective. Let's explore it further.";
  } catch (error) {
    console.error("AI Response Error:", error);
    return "That's a valid observation. I'd be interested to hear more thoughts on this.";
  }
}

export async function analyzeSentiment(text: string): Promise<'Positive' | 'Neutral' | 'Negative'> {
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: `Analyze the sentiment of this text and return ONLY one word: Positive, Neutral, or Negative.\nText: "${text}"`,
  });
  
  const result = response.text?.trim().toLowerCase();
  if (result?.includes('positive')) return 'Positive';
  if (result?.includes('negative')) return 'Negative';
  return 'Neutral';
}

// Keep the new functions if they are used elsewhere
export async function analyzeSessionMetrics(
  config: SessionConfig,
  transcripts: TranscriptSegment[],
  participants: Participant[]
): Promise<SessionMetrics> {
  const transcriptText = transcripts.map(t => {
    const p = participants.find(p => p.id === t.participantId);
    return `${p?.name || 'Unknown'}: ${t.text}`;
  }).join('\n');

  const prompt = `
    Analyze the following group discussion transcript based on the topic: "${config.topic}".
    
    Transcript:
    ${transcriptText}
    
    Provide a detailed analysis of the discussion, including:
    1. Overall topic relevance (0-100)
    2. Overall coherence (0-100)
    3. Number of filler words used (e.g., um, uh, like, you know)
    4. Vocabulary richness score (0-100)
    5. Sentiment distribution (percentages of positive, neutral, negative, summing to 100)
    6. For each participant, provide:
       - Estimated speaking duration (in seconds, based on word count, assuming ~150 words per minute)
       - Word count
       - Confidence score (0-100)
       - Assertiveness score (0-100)
       - Politeness score (0-100)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topicRelevance: { type: Type.NUMBER },
          coherence: { type: Type.NUMBER },
          fillerWords: { type: Type.NUMBER },
          vocabularyRichness: { type: Type.NUMBER },
          sentimentDistribution: {
            type: Type.OBJECT,
            properties: {
              positive: { type: Type.NUMBER },
              neutral: { type: Type.NUMBER },
              negative: { type: Type.NUMBER }
            },
            required: ["positive", "neutral", "negative"]
          },
          participantMetrics: {
            type: Type.OBJECT,
            description: "Keys are participant names",
            additionalProperties: {
              type: Type.OBJECT,
              properties: {
                speakingDuration: { type: Type.NUMBER },
                wordCount: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
                assertiveness: { type: Type.NUMBER },
                politeness: { type: Type.NUMBER }
              },
              required: ["speakingDuration", "wordCount", "confidence", "assertiveness", "politeness"]
            }
          }
        },
        required: ["topicRelevance", "coherence", "fillerWords", "vocabularyRichness", "sentimentDistribution", "participantMetrics"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    const cleanText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const data = JSON.parse(cleanText);
    
    // Map participant names back to IDs
    const mappedParticipantMetrics: Record<string, any> = {};
    participants.forEach(p => {
      // Find matching name in data.participantMetrics, or default
      const pData = data.participantMetrics[p.name] || {
        speakingDuration: 0,
        wordCount: 0,
        confidence: 0,
        assertiveness: 0,
        politeness: 0
      };
      mappedParticipantMetrics[p.id] = pData;
    });

    return {
      ...data,
      participantMetrics: mappedParticipantMetrics
    };
  } catch (e) {
    console.error("Failed to parse metrics", e);
    throw new Error("Failed to analyze metrics");
  }
}

export async function generateAIResponse(
  config: SessionConfig,
  transcripts: TranscriptSegment[],
  participants: Participant[]
): Promise<string> {
  const transcriptText = transcripts.map(t => {
    const p = participants.find(p => p.id === t.participantId);
    return `${p?.name || 'Unknown'}: ${t.text}`;
  }).join('\n');

  const prompt = `
    You are an AI participant in a group discussion.
    The topic is: "${config.topic}".
    
    Here is the discussion so far:
    ${transcriptText}
    
    Provide a concise, relevant, and natural-sounding response to continue the discussion. 
    Keep it under 3 sentences. Do not include your name in the output, just the spoken text.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  return response.text || "I agree with the points made so far.";
}
