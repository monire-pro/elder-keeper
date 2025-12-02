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


# --------------------------------------------------------------------
# ENVIRONMENT + APP SETUP
# --------------------------------------------------------------------
load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True
)

PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = os.getenv("LOCATION")
ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "piTKgcLEGmPE4e6mEKli")
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")


# --------------------------------------------------------------------
# FIREBASE INITIALIZATION
# --------------------------------------------------------------------
if not firebase_admin._apps:
    cred = credentials.Certificate(CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred)

# Firestore (native mode safe)
try:
    db = firestore.client(database_id="elderkeep-db")
except TypeError:
    db = firestore.client()


# --------------------------------------------------------------------
# VERTEX AI
# --------------------------------------------------------------------
vertexai.init(project=PROJECT_ID, location=LOCATION)
model = GenerativeModel("gemini-2.0-flash-exp")


# --------------------------------------------------------------------
# ELEVENLABS
# --------------------------------------------------------------------
eleven = ElevenLabs(api_key=ELEVEN_KEY)


# ====================================================================
# DATABASE HELPERS
# ====================================================================
def sanitize_firestore_key(text):
    return re.sub(r'[^a-zA-Z0-9]', '_', text).strip('_')


def get_user_profile(user_id="arthur_01"):
    """Fetch user from Firestore. Return None if no name set."""
    try:
        doc = db.collection("users").document(user_id).get()
        if not doc.exists:
            return None, {}
        data = doc.to_dict()
        name = data.get("name", "Unknown")
        if name == "Unknown" or name == "":
            return None, data
        return name, data
    except Exception as e:
        print("⚠️ Firestore Error:", e)
        return None, {}


def update_user_name(user_id, new_name):
    try:
        db.collection("users").document(user_id).set(
            {"name": new_name}, merge=True
        )
        print(f"💾 Saved new name: {new_name}")
    except Exception as e:
        print("⚠️ Firestore Write Error:", e)


def update_family_memory(user_id, relation_name, description):
    try:
        db.collection("users").document(user_id).update({
            f"family.{relation_name}": f"{relation_name}, {description}"
        })
        print(f"💾 Learned Face: {relation_name}")
        return True
    except Exception as e:
        print("❌ DB Update Error:", e)
        return False


# ====================================================================
# SAFETY SYSTEM
# ====================================================================
def trigger_family_alert(user_name, alert_type, message):
    try:
        db.collection("alerts").add({
            "user_name": user_name,
            "type": alert_type,
            "message": message,
            "timestamp": datetime.now(),
            "status": "active"
        })
        print(f"🚨 ALERT SENT [{alert_type}] {message}")
    except Exception as e:
        print("❌ Failed to send alert:", e)


def check_safety_risk(text):
    text = text.lower()

    if any(w in text for w in ["help me", "i fell", "fallen", "pain", "bleeding", "hurt myself", "emergency"]):
        return "CRISIS"

    if any(w in text for w in ["want to go home", "where is the door", "let me out", "who are you people"]):
        return "WANDERING"

    return "SAFE"


# ====================================================================
# AI HELPERS
# ====================================================================
def extract_name_with_gemini(txt):
    prompt = f"Extract ONLY the First Name. Example: 'I am Arthur' -> Arthur. Text: {txt}"
    try:
        res = model.generate_content(prompt)
        return res.text.strip().replace('"', '').replace('.', '')
    except:
        return "Friend"


def transcribe_audio(path):
    r = sr.Recognizer()
    with sr.AudioFile(path) as src:
        audio = r.record(src)
        try:
            return r.recognize_google(audio)
        except:
            return ""


def text_to_speech(text):
    try:
        audio_gen = eleven.text_to_speech.convert(
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
        return base64.b64encode(b"".join(audio_gen)).decode("utf-8")
    except Exception as e:
        print("❌ ElevenLabs Error:", e)
        return None


# ====================================================================
# WEBSOCKET CHAT ENDPOINT
# ====================================================================
@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("📱 Client Connected")

    user_name, user_data = get_user_profile("arthur_01")
    mode = "ONBOARDING" if user_name is None else "COMPANION"

    # Start chat session
    chat = model.start_chat()

    if mode == "COMPANION":
        system_prompt = f"""
        You are Myra, a warm, patient AI companion for {user_name}.
        PROFILE: {json.dumps(user_data)}
        Speak in short sentences. Be gentle and reassuring.
        """
        chat.send_message(system_prompt)
    else:
        await websocket.send_text(json.dumps({
            "type": "text",
            "data": "Hello. I don't think we've met. What is your name?"
        }))

    try:
        while True:
            incoming = json.loads(await websocket.receive_text())

            # ------------------------------------------------------------
            # AUDIO INPUT
            # ------------------------------------------------------------
            if incoming.get("type") == "audio_input":

                audio_bytes = base64.b64decode(incoming["data"])
                with open("temp_in.m4a", "wb") as f:
                    f.write(audio_bytes)

                sound = AudioSegment.from_file("temp_in.m4a", format="m4a")
                sound.export("temp_in.wav", format="wav")

                user_text = transcribe_audio("temp_in.wav")
                print("🗣️ User:", user_text)

                if not user_text:
                    continue

                # SAFETY CHECK
                risk = check_safety_risk(user_text)

                if risk == "CRISIS":
                    trigger_family_alert(user_name, "CRISIS", user_text)
                    response = chat.send_message(
                        f"EMERGENCY: User said: {user_text}. Tell them to stay still while I alert family."
                    )
                    ai_text = response.text

                elif risk == "WANDERING":
                    trigger_family_alert(user_name, "WANDERING", user_text)
                    response = chat.send_message(
                        f"WANDERING: User said: {user_text}. Use gentle validation therapy."
                    )
                    ai_text = response.text

                else:
                    # NORMAL
                    if mode == "ONBOARDING":
                        extracted = extract_name_with_gemini(user_text)
                        update_user_name("arthur_01", extracted)

                        mode = "COMPANION"
                        user_name = extracted
                        chat = model.start_chat()
                        chat.send_message(f"User is {user_name}. Welcome them kindly.")

                        r = chat.send_message(user_text)
                        ai_text = r.text

                    else:
                        r = chat.send_message(user_text)
                        ai_text = r.text

                print("🤖 Myra:", ai_text)

                # TEXT OR AUDIO RESPONSE
                audio64 = text_to_speech(ai_text)
                if audio64:
                    await websocket.send_text(json.dumps({"type": "audio", "data": audio64}))
                else:
                    await websocket.send_text(json.dumps({"type": "text", "data": ai_text}))

            # ------------------------------------------------------------
            # IMAGE INPUT
            # ------------------------------------------------------------
            elif incoming.get("type") == "image_input":
                print("📸 Processing Image...")
                raw = base64.b64decode(incoming["data"])
                image_part = Part.from_data(data=raw, mime_type="image/jpeg")

                _, profile = get_user_profile("arthur_01")
                family_str = json.dumps(profile.get("family", {}))

                prompt = f"""
                You are Myra. Arthur is showing a person.
                Known Family: {family_str}
                If match: "That looks like [Name]!"
                If unknown: "UNKNOWN_PERSON: [description]"
                """

                result = chat.send_message([prompt, image_part])
                ai_text = result.text.strip()
                print("🤖 Vision:", ai_text)

                if "UNKNOWN_PERSON:" in ai_text:
                    desc = ai_text.replace("UNKNOWN_PERSON:", "").strip()

                    trigger_family_alert(
                        user_name,
                        "UNKNOWN_FACE",
                        f"Arthur saw an unknown person: {desc}"
                    )

                    ai_text = f"I see someone: {desc}. I don't recognize them, but I have asked Sarah to update my memory."

                audio64 = text_to_speech(ai_text)
                if audio64:
                    await websocket.send_text(json.dumps({"type": "audio", "data": audio64}))
                else:
                    await websocket.send_text(json.dumps({"type": "text", "data": ai_text}))

    except WebSocketDisconnect:
        print("📱 Disconnected")


# ====================================================================
# REST: Description Generator (Dashboard)
# ====================================================================
class MemoryImage(BaseModel):
    image_base64: str


@app.post("/api/generate-description")
async def generate_description(payload: MemoryImage):
    try:
        b64 = payload.image_base64.split(",")[-1]
        img = base64.b64decode(b64)
        part = Part.from_data(img, mime_type="image/jpeg")

        prompt = "Describe the person in under 15 words for a facial memory database."
        res = model.generate_content([prompt, part])

        return {"description": res.text.strip()}

    except Exception as e:
        print("❌ Error:", e)
        return {"description": "Error analyzing image."}
