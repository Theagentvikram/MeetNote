"""
AI Service for meeting summarization using OpenRouter (Mistral 7B)
"""

import httpx
import logging
from typing import List, Dict, Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI-powered meeting analysis using OpenRouter"""
    
    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL
        self.model = settings.OPENROUTER_MODEL
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def summarize_transcript(self, transcript: str) -> Dict[str, Any]:
        """
        Generate a summary of the meeting transcript
        
        Args:
            transcript: Full meeting transcript
        
        Returns:
            Dictionary with summary, key points, and action items
        """
        if not self.api_key:
            logger.warning("OpenRouter API key not configured, skipping AI summarization")
            return {
                "summary": "AI summarization not configured",
                "key_points": [],
                "action_items": []
            }
        
        try:
            prompt = f"""You are an expert meeting analyst. Analyze this transcript and create a professional meeting summary.

IMPORTANT INSTRUCTIONS:
1. Create detailed topic-based sections (not just bullet points)
2. Include context and specifics from the discussion
3. Organize information hierarchically with clear headers
4. Extract precise action items with assignees and deadlines
5. Be comprehensive - don't oversimplify

FORMAT REQUIREMENTS:
- Start with a brief overview paragraph (2-3 sentences)
- Group related points into topic sections with descriptive headers
- Under each topic, provide detailed sub-points with context
- Action items must include WHO will do WHAT and by WHEN (if mentioned)
- Use proper formatting with dashes and indentation

TRANSCRIPT:
{transcript}

Provide your response as JSON with this exact structure (use actual newline characters, not escaped):
{{
  "summary": "2-3 sentence overview of the meeting",
  "key_points": [
    "**Topic Header 1**
- Detailed point with full context
- Another detailed sub-point
- Include specifics like names, numbers, dates",
    "**Topic Header 2**
- Complete explanations, not fragments
- Show relationships between ideas
- Technical details when relevant"
  ],
  "action_items": [
    "**Person Name**: Specific task description with deadline if mentioned",
    "**Team/Role**: Detailed action with context"
  ]
}}

RESPONSE:"""
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://meetnoteapp.netlify.app",
                "X-Title": "MeetNote"
            }
            
            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.7,
                "max_tokens": 1000
            }
            
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Extract AI response
            ai_response = data["choices"][0]["message"]["content"]
            
            # Try to parse JSON response
            import json
            try:
                # Look for JSON in the response
                json_start = ai_response.find("{")
                json_end = ai_response.rfind("}") + 1
                if json_start != -1 and json_end > json_start:
                    result = json.loads(ai_response[json_start:json_end])
                else:
                    # Fallback if no JSON found
                    result = self._parse_text_response(ai_response)
            except json.JSONDecodeError:
                result = self._parse_text_response(ai_response)
            
            logger.info("Successfully generated meeting summary")
            return result
            
        except Exception as e:
            logger.error(f"AI summarization error: {str(e)}")
            return {
                "summary": "Could not generate AI summary",
                "key_points": [],
                "action_items": []
            }
    
    def _parse_text_response(self, response: str) -> Dict[str, Any]:
        """Parse text response if JSON parsing fails"""
        lines = response.strip().split("\n")
        
        summary = ""
        key_points = []
        action_items = []
        
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if "summary" in line.lower():
                current_section = "summary"
            elif "key point" in line.lower():
                current_section = "key_points"
            elif "action item" in line.lower():
                current_section = "action_items"
            elif line.startswith("-") or line.startswith("•") or line.startswith("*"):
                item = line[1:].strip()
                if current_section == "key_points":
                    key_points.append(item)
                elif current_section == "action_items":
                    action_items.append(item)
            elif current_section == "summary" and line:
                summary += line + " "
        
        return {
            "summary": summary.strip() or "Meeting discussion",
            "key_points": key_points if key_points else ["Discussion points not extracted"],
            "action_items": action_items if action_items else []
        }
    
    async def generate_highlight_description(self, transcript_segment: str) -> str:
        """Generate a description for a highlight clip"""
        if not self.api_key:
            return "Highlight from meeting"
        
        try:
            prompt = f"Summarize this meeting excerpt in one concise sentence:\n\n{transcript_segment}"
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 100
            }
            
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            )
            
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
            
        except Exception as e:
            logger.error(f"Highlight description error: {str(e)}")
            return "Highlight from meeting"
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()
