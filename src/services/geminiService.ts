import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult, SessionConfig, TranscriptSegment, Participant, SessionMetrics } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateAudio(text: string, voiceName: string): Promise<string> {
  try {
    const res = await fetch("/api/ai/audio", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ text, voiceName })
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.audio || "";
  } catch (err) {
    console.error("Client TTS error:", err);
    return "";
  }
}

export async function analyzeTranscript(text: string, topic: string, title?: string): Promise<AnalysisResult> {
  const res = await fetch("/api/ai/analyze", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${localStorage.getItem("token")}`
    },
    body: JSON.stringify({ text, topic, title })
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Analysis failed");
  }
  return await res.json();
}

export async function getAIParticipantResponse(context: string, topic: string, botName: string = "AI Participant"): Promise<string> {
  try {
    const res = await fetch("/api/ai/response", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ context, topic, botName })
    });
    if (!res.ok) throw new Error("AI response failed");
    const data = await res.json();
    return data.response;
  } catch (err) {
    console.error("Client AI response error:", err);
    return "That's a valid observation. I'd be interested to hear more thoughts on this.";
  }
}

export async function analyzeSentiment(text: string): Promise<'Positive' | 'Neutral' | 'Negative'> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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
    model: "gemini-3-flash-preview",
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
    const data = JSON.parse(response.text || '{}');
    
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
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text || "I agree with the points made so far.";
}
