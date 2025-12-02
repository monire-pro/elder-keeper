import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Users, Plus, Trash2, Upload, Loader, Camera, Sparkles } from 'lucide-react';

// POINT THIS TO YOUR PYTHON BACKEND
const API_URL = "http://localhost:8000/api/generate-description";

export default function FamilyManager({ prefillDescription }) {
  const [family, setFamily] = useState({});
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Reference to name input to auto-focus it
  const nameInputRef = useRef(null);

  // 1. FETCH EXISTING FAMILY
  useEffect(() => {
    const fetchFamily = async () => {
      const docRef = doc(db, "users", "arthur_01");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().family) {
        setFamily(docSnap.data().family);
      }
    };
    fetchFamily();
  }, []);

  // 2. HANDLE "REACTIVE" INPUT (From Alert)
  useEffect(() => {
    if (prefillDescription) {
      setNewDesc(prefillDescription);
      setNewName("");
      // Visual cue: Focus the name box so they can just type
      if(nameInputRef.current) nameInputRef.current.focus();
    }
  }, [prefillDescription]);

  // 3. HANDLE "PROACTIVE" INPUT (Image Upload)
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAnalyzing(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: reader.result })
        });
        const data = await response.json();
        
        // Auto-fill description from Gemini
        setNewDesc(data.description);
        setNewName("");
        if(nameInputRef.current) nameInputRef.current.focus();
        
      } catch (error) {
        console.error(error);
        alert("Error connecting to AI Brain.");
      } finally {
        setAnalyzing(false);
      }
    };
  };

  // 4. SAVE TO DB
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName || !newDesc) return;
    setLoading(true);

    const updatedFamily = {
      ...family,
      // Format: "Uncle Bob: A man with a beard..."
      [newName]: `${newName}, ${newDesc}`
    };

    try {
      const userRef = doc(db, "users", "arthur_01");
      await updateDoc(userRef, { family: updatedFamily });
      setFamily(updatedFamily);
      setNewName("");
      setNewDesc("");
    } catch (err) {
      console.error(err);
      alert("Error saving memory");
    }
    setLoading(false);
  };

  const handleDelete = async (key) => {
    const updatedFamily = { ...family };
    delete updatedFamily[key];
    try {
      const userRef = doc(db, "users", "arthur_01");
      await updateDoc(userRef, { family: updatedFamily });
      setFamily(updatedFamily);
    } catch (err) { console.error(err); }
  };

  return (
    <div id="add-memory-form" style={containerStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users color="#4A5568" />
          <h2 style={{ margin: 0, color: '#2D3748', fontSize: '18px' }}>Memory Bridge Manager</h2>
        </div>
      </div>

      {/* --- INPUT ZONE --- */}
      <div style={formContainerStyle}>
        
        {/* A. UPLOAD BUTTON (Proactive) */}
        <div style={{ marginBottom: '15px' }}>
            <label htmlFor="photo-upload" style={uploadBtnStyle}>
                {analyzing ? <Loader className="spin" size={20} /> : <Camera size={20} />}
                {analyzing ? "AI is Analyzing Photo..." : "Upload Photo to Auto-Describe"}
            </label>
            <input 
                id="photo-upload" type="file" accept="image/*" 
                onChange={handleImageUpload} style={{ display: 'none' }} 
                disabled={analyzing}
            />
        </div>

        {/* B. THE FORM (Shared by both paths) */}
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* Visual Indicator of AI Help */}
            {newDesc && (
                <div style={{ fontSize: '12px', color: '#805AD5', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={12} /> 
                    AI Description Ready. Just name it!
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {/* NAME INPUT */}
                <input 
                  ref={nameInputRef}
                  type="text" 
                  placeholder="Name (e.g. Uncle Bob)" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={inputStyle}
                  autoFocus
                />
                
                {/* DESCRIPTION INPUT (Auto-filled) */}
                <input 
                  type="text" 
                  placeholder="Visual Description (Auto-filled by AI)" 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  style={{ ...inputStyle, flex: 2, backgroundColor: newDesc ? '#F0FFF4' : 'white' }}
                />
                
                <button type="submit" disabled={loading || !newDesc} style={saveBtnStyle}>
                  {loading ? "Saving..." : <><Plus size={16} /> Save Face</>}
                </button>
            </div>
        </form>
      </div>

      {/* --- FAMILY LIST --- */}
      <div style={gridStyle}>
        {Object.entries(family).map(([key, value]) => (
          <div key={key} style={cardStyle}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#2D3748' }}>{key}</div>
              <div style={{ fontSize: '12px', color: '#718096', fontStyle: 'italic', marginTop: '2px' }}>
                "{value.split(',')[1] || value}"
              </div>
            </div>
            <button onClick={() => handleDelete(key)} style={deleteBtnStyle}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {Object.keys(family).length === 0 && <p style={{ color: '#aaa', fontStyle: 'italic' }}>No memories yet. Upload a photo to start.</p>}
      </div>
    </div>
  );
}

// --- STYLES ---
const containerStyle = { backgroundColor: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginTop: '30px' };
const headerStyle = { borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' };
const formContainerStyle = { backgroundColor: '#F7FAFC', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px dashed #CBD5E0' };
const uploadBtnStyle = { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#2B6CB0', fontWeight: 'bold', backgroundColor: 'white', padding: '10px 15px', borderRadius: '8px', border: '1px solid #BEE3F8', transition: 'all 0.2s' };
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E0', outline: 'none', flex: 1, fontSize: '14px' };
const saveBtnStyle = { backgroundColor: '#38A169', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', opacity: '0.9' };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' };
const cardStyle = { backgroundColor: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const deleteBtnStyle = { backgroundColor: 'transparent', border: 'none', color: '#E53E3E', cursor: 'pointer', padding: '5px' };