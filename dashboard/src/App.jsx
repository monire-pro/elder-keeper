import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { Activity, Heart, Clock, User, Bell } from 'lucide-react';
import './index.css'; 
import FamilyManager from './FamilyManager'; // ✅ IMPORTED

// Simple notification sound URL
const ALERT_SOUND_URL = "/alert.mp3";

function App() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("Stable");
  
  // ✨ NEW: State to hold the description waiting to be added
  const [pendingDescription, setPendingDescription] = useState("");

  // Use a Ref to track if it's the first time the page loads
  const isFirstLoad = useRef(true); 

  const playSound = () => {
    const audio = new Audio(ALERT_SOUND_URL);
    audio.play().catch(e => console.log("Audio play failed (interaction required):", e));
  };

  // ✨ NEW: Helper to handle the click and scroll
  const handlePrefillClick = (message) => {
    // 1. Extract raw description from the alert message
    // The backend sends: "Arthur saw an unknown person: [Description]"
    const rawDescription = message.replace("Arthur saw an unknown person: ", "");
    
    // 2. Set state
    setPendingDescription(rawDescription);
    
    // 3. Smooth scroll down to the form
    const formElement = document.getElementById("add-memory-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    // Listen to "alerts" collection in real-time
    const q = query(collection(db, "alerts"), orderBy("timestamp", "desc"), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Check for new alerts to play sound
      if (!isFirstLoad.current) {
        const hasNewAdditions = snapshot.docChanges().some(change => change.type === 'added');
        if (hasNewAdditions) {
          playSound();
        }
      } else {
        isFirstLoad.current = false; // Mark initial load as done
      }

      setAlerts(alertsData);
      
      // Update Status based on most recent alert
      if (alertsData.length > 0) {
        const recent = alertsData[0];
        if (recent.type === "CRISIS") setStatus("CRITICAL");
        else if (recent.type === "WANDERING") setStatus("ATTENTION");
        else setStatus("Stable");
      } else {
        setStatus("Stable");
      }
    });

    return () => unsubscribe();
  }, []);

  // Dynamic Status Colors
  const getStatusColor = () => {
    if (status === 'CRITICAL') return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'ATTENTION') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
              ElderKeep Family
            </h1>
            <p className="text-slate-500 mt-1 font-medium">Monitoring: Arthur (Father)</p>
          </div>
          
          <div className={`px-5 py-2.5 rounded-full font-bold flex items-center gap-2 border shadow-sm transition-colors duration-300 ${getStatusColor()}`}>
            <Activity size={20} /> 
            <span>{status}</span>
          </div>
        </header>

        {/* STATS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          <Card 
            icon={<Heart className="text-red-500" size={24} />} 
            title="Heart Rate" 
            value="72 bpm" 
          />
          <Card 
            icon={<Clock className="text-blue-500" size={24} />} 
            title="Last Active" 
            value="Just now" 
          />
          <Card 
            icon={<User className="text-emerald-500" size={24} />} 
            title="Mood" 
            value="Calm" 
          />
        </div>

        {/* LIVE ALERTS FEED */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-10">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
              <Bell size={18} /> Live Activity Log
            </h2>
          </div>
          
          <div className="p-6 flex flex-col gap-4">
            {alerts.length === 0 ? (
              <p className="text-slate-400 text-center py-8 italic">No recent activity logged.</p>
            ) : (
              alerts.map(alert => (
                <AlertItem 
                    key={alert.id} 
                    alert={alert} 
                    onPrefill={() => handlePrefillClick(alert.message)} // ✅ Pass handler
                />
              ))
            )}
          </div>
        </div>

        {/* ✨ NEW: FAMILY MANAGER SECTION */}
        <FamilyManager prefillDescription={pendingDescription} />

      </div>
    </div>
  );
}

// Sub-Component: Stat Card
const Card = ({ icon, title, value }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
    <div className="flex justify-between items-start mb-3">
      <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
    </div>
    <div className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</div>
    <div className="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{value}</div>
  </div>
);

// Sub-Component: Alert Item
const AlertItem = ({ alert, onPrefill }) => {
  // Determine styles based on alert type
  let borderClass = "border-blue-500";
  let bgClass = "bg-blue-50";
  let icon = "ℹ️ INFO";

  if (alert.type === 'CRISIS') {
    borderClass = "border-red-500";
    bgClass = "bg-red-50";
    icon = "🚨 EMERGENCY";
  } else if (alert.type === 'WANDERING') {
    borderClass = "border-orange-500";
    bgClass = "bg-orange-50";
    icon = "⚠️ WANDERING";
  } else if (alert.type === 'UNKNOWN_FACE') {
    borderClass = "border-purple-500";
    bgClass = "bg-purple-50";
    icon = "👤 UNKNOWN FACE";
  }

  // Format Time
  const timeString = alert.timestamp?.seconds 
    ? new Date(alert.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    : 'Just now';

  return (
    <div className={`relative p-5 rounded-xl border-l-4 shadow-sm bg-white transition-all hover:bg-slate-50 flex justify-between items-center ${borderClass}`}>
      <div className="flex-1">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
            <span className="font-bold text-slate-800 flex items-center gap-2">
            {icon}
            </span>
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            {timeString}
            </span>
        </div>
        <p className="text-slate-600 leading-relaxed">{alert.message}</p>
      </div>

      {/* ✅ ADD FACE BUTTON */}
      {alert.type === 'UNKNOWN_FACE' && (
        <button 
            onClick={onPrefill}
            className="ml-4 px-3 py-2 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-200 transition-colors whitespace-nowrap"
        >
            + Add Face
        </button>
      )}
    </div>
  );
};

export default App;