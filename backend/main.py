import os
import json
import base64
import asyncio
import re
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel 
from dotenv import load_dotenv

# Cloud Services
import vertexai
from vertexai.generative_models import GenerativeModel, ChatSession, Part
from elevenlabs.client import ElevenLabs 
from elevenlabs import VoiceSettings      

import firebase_admin
from firebase_admin import credentials, firestore
import speech_recognition as sr
from pydub import AudioSegment
import io

# Load Environment Variables
load_dotenv()

app = FastAPI()

# ✅ ALLOW DASHBOARD TO TALK TO PYTHON
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION ---
PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = os.getenv("LOCATION")
ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "piTKgcLEGmPE4e6mEKli") 
# This variable might be a path (local) or the actual JSON string (Render)
CREDENTIALS_VAL = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

# 1. Initialize Firebase (ROBUST FIX)
if not firebase_admin._apps:
    if CREDENTIALS_VAL and CREDENTIALS_VAL.strip().startswith("{"):
        # ✅ Render Mode: It's the JSON string itself
        print("🔧 Detected JSON credentials string (Render Mode)")
        try:
            creds_dict = json.loads(CREDENTIALS_VAL)
            cred = credentials.Certificate(creds_dict)
        except json.JSONDecodeError as e:
            print(f"❌ Error decoding credentials JSON: {e}")
            # Try handling escaped newlines if copy-paste went wrong
            try:
                fixed_val = CREDENTIALS_VAL.replace("\\n", "\n")
                creds_dict = json.loads(fixed_val)
                cred = credentials.Certificate(creds_dict)
            except:
                raise ValueError("Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS")
    else:
        # ✅ Local Mode: It's a file path
        print(f"🔧 Detected credentials path: {CREDENTIALS_VAL}")
        cred = credentials.Certificate(CREDENTIALS_VAL)
        
    firebase_admin.initialize_app(cred)

# Initialize Firestore
try:
    db = firestore.client(database_id="elderkeep-db")
except TypeError:
    db = firestore.client() 

# 2. Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)
model = GenerativeModel("gemini-2.0-flash-exp") 

# 3. Initialize ElevenLabs
eleven = ElevenLabs(api_key=ELEVEN_KEY)

# --- DATABASE HELPERS ---

def sanitize_firestore_key(text):
    clean_text = re.sub(r'[^a-zA-Z0-9]', '_', text)
    return clean_text.strip('_')

def get_user_profile(user_id="arthur_01"):
    try:
        doc = db.collection("users").document(user_id).get()
        if doc.exists:
            data = doc.to_dict()
            name = data.get("name", "Unknown")
            if name == "Unknown" or name == "":
                return None, data 
            return name, data
        return None, {}
    except Exception as e:
        print(f"⚠️ Firestore Error: {e}")
        return None, {}

def update_user_name(user_id, new_name):
    try:
        db.collection("users").document(user_id).set({
            "name": new_name
        }, merge=True)
        print(f"💾 Saved new name to DB: {new_name}")
    except Exception as e:
        print(f"⚠️ Firestore Write Error: {e}")

# --- SAFETY HELPERS ---

def trigger_family_alert(user_name, alert_type, message):
    try:
        alert_data = {
            "user_name": user_name,
            "type": alert_type, 
            "message": message,
            "timestamp": datetime.now(),
            "status": "active"
        }
        db.collection("alerts").add(alert_data)
        print(f"🚨 ALERT SENT TO FAMILY: [{alert_type}] {message}")
    except Exception as e:
        print(f"❌ Failed to send alert: {e}")

def check_safety_risk(text):
    text = text.lower()
    crisis_keywords = ["help me", "i fell", "fallen", "pain", "bleeding", "hurt myself", "emergency"]
    for word in crisis_keywords:
        if word in text: return "CRISIS"
    wandering_keywords = ["want to go home", "where is the door", "let me out", "who are you people"]
    for word in wandering_keywords:
        if word in text: return "WANDERING"
    return "SAFE"

# --- AI HELPERS ---

def extract_name_with_gemini(user_text):
    prompt = f"Extract ONLY the First Name. Input: 'I am Arthur' -> Arthur. Text: {user_text}"
    try:
        response = model.generate_content(prompt)
        return response.text.strip().replace('"', '').replace('.', '')
    except: return "Friend"

def transcribe_audio(file_path):
    recognizer = sr.Recognizer()
    with sr.AudioFile(file_path) as source:
        audio_data = recognizer.record(source)
        try: return recognizer.recognize_google(audio_data)
        except: return ""

def text_to_speech(text):
    """
    Generates audio using ElevenLabs.
    """
    try:
        audio_generator = eleven.text_to_speech.convert(
            voice_id=VOICE_ID,
            optimize_streaming_latency="0",
            output_format="mp3_22050_32",
            text=text,
            model_id="eleven_turbo_v2",
            voice_settings=VoiceSettings(
                stability=0.8,
                similarity_boost=0.75,
                style=0.0,
                use_speaker_boost=True
            )
        )
        return base64.b64encode(b"".join(audio_generator)).decode('utf-8')
    except Exception as e:
        print(f"❌ ElevenLabs Error: {e}")
        return None

# --- WEBSOCKET ENDPOINT ---

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("📱 Client Connected")
    
    user_name, user_data = get_user_profile("arthur_01")
    mode = "ONBOARDING" if user_name is None else "COMPANION"
    
    if mode == "COMPANION":
        SYSTEM_PROMPT = f"""
        You are "Myra," a warm, patient companion for {user_name}.
        PROFILE: {json.dumps(user_data)}
        1. Speak in SHORT sentences.
        2. If the user shows you an image, analyze it for safety or explain what it is gently.
        3. Be incredibly kind.
        """
        global chat
        chat = model.start_chat()
        chat.send_message(SYSTEM_PROMPT)
    else:
        greeting = "Hello. I don't think we've been introduced. What is your name?"
        # Fallback to Text for speed on connect
        await websocket.send_text(json.dumps({"type": "text", "data": greeting}))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # ==========================================
            # 🎤 CASE 1: AUDIO INPUT
            # ==========================================
            if message.get("type") == "audio_input":
                audio_bytes = base64.b64decode(message["data"])
                with open("temp_input.m4a", "wb") as f: f.write(audio_bytes)
                
                try:
                    sound = AudioSegment.from_file("temp_input.m4a", format="m4a")
                    sound.export("temp_input.wav", format="wav")
                    user_text = transcribe_audio("temp_input.wav")
                    print(f"🗣️ User: {user_text}")

                    if not user_text: continue

                    # --- A. SAFETY CHECK ---
                    safety_status = check_safety_risk(user_text)
                    if safety_status == "CRISIS":
                        trigger_family_alert(user_name, "CRISIS", user_text)
                        response = chat.send_message(f"CRITICAL EMERGENCY: User said '{user_text}'. Tell them to stay still and you are calling family.")
                        ai_text = response.text
                    
                    elif safety_status == "WANDERING":
                        trigger_family_alert(user_name, "WANDERING", user_text)
                        response = chat.send_message(f"USER WANDERING: User said '{user_text}'. Use Validation Therapy.")
                        ai_text = response.text
                    
                    # --- B. NORMAL CHAT / ONBOARDING ---
                    else:
                        if mode == "ONBOARDING":
                            extracted_name = extract_name_with_gemini(user_text)
                            update_user_name("arthur_01", extracted_name)
                            mode = "COMPANION"
                            user_name = extracted_name
                            chat = model.start_chat()
                            chat.send_message(f"User is {user_name}. Welcome them.")
                            response = chat.send_message(user_text)
                            ai_text = response.text
                        else:
                            # Standard Chat
                            response = chat.send_message(user_text)
                            ai_text = response.text
                    
                    print(f"🤖 Myra: {ai_text}")
                    
                    # ✅ RESPONSE LOGIC (Audio vs Text Fallback)
                    audio_base64 = text_to_speech(ai_text)
                    if audio_base64:
                        await websocket.send_text(json.dumps({"type": "audio", "data": audio_base64}))
                    else:
                        print(f"🚫 Sending Text Fallback: {ai_text}")
                        await websocket.send_text(json.dumps({"type": "text", "data": ai_text}))

                except Exception as e:
                    print(f"❌ Audio Error: {e}")

            # ==========================================
            # 📸 CASE 2: IMAGE INPUT
            # ==========================================
            elif message.get("type") == "image_input":
                print("📸 Analyzing Image...")
                try:
                    image_bytes = base64.b64decode(message["data"])
                    image_part = Part.from_data(data=image_bytes, mime_type="image/jpeg")
                    
                    _, current_data = get_user_profile("arthur_01")
                    family_str = json.dumps(current_data.get('family', {}))
                    
                    vision_prompt = f"""
                    You are Myra. Arthur is showing you a person.
                    KNOWN FAMILY: {family_str}
                    INSTRUCTIONS:
                    1. If match found: "That looks like [Name]!"
                    2. If NO match: "UNKNOWN_PERSON: [Description]"
                    """
                    
                    response = chat.send_message([vision_prompt, image_part])
                    ai_text = response.text.strip()
                    print(f"🤖 Vision Analysis: {ai_text}")
                    
                    if "UNKNOWN_PERSON:" in ai_text:
                        description = ai_text.replace("UNKNOWN_PERSON:", "").strip()
                        
                        # 1. Trigger Dashboard Alert
                        trigger_family_alert(
                            user_name, 
                            "UNKNOWN_FACE", 
                            f"Arthur saw an unknown person: {description}"
                        )

                        # 2. Comforting Message (NO QUESTION ASKED)
                        ai_text = f"I see someone: {description}. I don't recognize them yet, but I have asked Sarah to update my memory."
                    
                    # ✅ RESPONSE LOGIC (Audio vs Text Fallback)
                    audio_base64 = text_to_speech(ai_text)
                    if audio_base64:
                        await websocket.send_text(json.dumps({"type": "audio", "data": audio_base64}))
                    else:
                        print(f"🚫 Sending Text Fallback: {ai_text}")
                        await websocket.send_text(json.dumps({"type": "text", "data": ai_text}))
                        
                except Exception as e:
                    print(f"❌ Vision Error: {e}")

    except WebSocketDisconnect:
        print("📱 Disconnected")

# --- DATA MODELS ---
class MemoryImage(BaseModel):
    image_base64: str

# --- REST ENDPOINTS (For Dashboard) ---
@app.post("/api/generate-description")
async def generate_memory_description(data: MemoryImage):
    print("📸 Dashboard requested image analysis...")
    try:
        if "," in data.image_base64:
            clean_b64 = data.image_base64.split(",")[1]
        else:
            clean_b64 = data.image_base64
            
        image_bytes = base64.b64decode(clean_b64)
        image_part = Part.from_data(data=image_bytes, mime_type="image/jpeg")
        
        prompt = "Describe the person in this photo for a facial recognition database. Under 15 words."
        response = model.generate_content([prompt, image_part])
        description = response.text.strip()
        
        print(f"✅ Generated: {description}")
        return {"description": description}

    except Exception as e:
        print(f"❌ API Error: {e}")
        return {"description": "Error analyzing image."}