"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function WatchClient({ roomId }) {
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const [videoVolume, setVideoVolume] = useState(1);
  const [callVolume, setCallVolume] = useState(1);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    // Initialize socket only once
    
    if (!socketRef.current) {
      socketRef.current = io("https://lovers-cinema-backend.onrender.com");
      console.log("Socket initialized:", socketRef.current.id);
    }

    const socket = socketRef.current;
    console.log("Joining room:", roomId);
    socket.emit("join-room", roomId);
    
    // Add connection status debugging
    socket.on("connect", () => {
      console.log("Socket connected successfully");
    });
    
    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });
    
    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("user-joined", () => {
      alert("Someone joined your room 👀");
    });

    socket.on("room-users", (count) => {
      console.log("Users in room:", count);

      // Start video call when second user joins
      if (count === 2) {
        console.log("Second user detected, starting video call...");
        startVideoCall();
      } else {
        console.log("Not starting video call - user count:", count);
      }
    });

    // WebRTC signaling events
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("user-joined");
      socket.off("room-users");
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);

      // Clean up video call
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [roomId]);

  const initPeerConnection = async () => {
    console.log("Initializing peer connection...");
    
    const socket = socketRef.current;
    if (!socket) {
      console.error("Socket not available");
      return null;
    }
    
    // Clean up existing stream if any
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    try {
      // Get local media stream with better constraints
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnectionRef.current = peerConnection;

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      updateCallVolume(callVolume);

      peerConnection.ontrack = (event) => {
        console.log("Received remote stream:", event);
        console.log("Number of streams:", event.streams.length);
        if (event.streams.length > 0) {
          console.log("Remote stream tracks:", event.streams[0].getTracks());
          setRemoteStreamActive(true);
        } else {
          setRemoteStreamActive(false);
        }
        
        if (remoteVideoRef.current) {
          console.log("Setting remote video srcObject");
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(err => console.log("Remote video play error:", err));
        } else {
          console.error("Remote video ref is null");
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };

      console.log("Peer connection initialized");
      return peerConnection;
    } catch (error) {
      console.error("Error initializing peer connection:", error);
      
      // Handle specific device errors
      if (error.name === 'NotReadableError' || error.name === 'DeviceInUseError') {
        console.error("Camera/microphone is already in use by another application");
        alert("Camera or microphone is already in use. Please:\n1. Close other video apps/tabs using camera\n2. Refresh the page and try again\n3. Grant camera permission when prompted");
      } else if (error.name === 'NotAllowedError') {
        console.error("Camera/microphone permission denied");
        alert("Camera or microphone permission denied. Please allow camera access in your browser settings and refresh the page.");
      } else if (error.name === 'NotFoundError') {
        console.error("No camera/microphone found");
        alert("No camera or microphone found. Please connect a camera and microphone.");
      }
      
      return null;
    }
  };

  const startVideoCall = async () => {
    console.log("Starting video call as initiator...");

    const socket = socketRef.current;
    if (!socket) {
      console.error("Socket not available");
      return;
    }

    const peerConnection = await initPeerConnection();
    if (!peerConnection) {
      console.error("Failed to initialize peer connection");
      return;
    }

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("offer", {
        roomId,
        offer,
      });

      console.log("Offer sent");
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const handleOffer = async (data) => {
    console.log("Received offer");

    const socket = socketRef.current;
    if (!socket) {
      console.error("Socket not available");
      return;
    }

    if (!peerConnectionRef.current) {
      const peerConnection = await initPeerConnection();
      if (!peerConnection) {
        console.error("Failed to initialize peer connection for offer");
        return;
      }
    }

    const peerConnection = peerConnectionRef.current;

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("answer", {
        roomId,
        answer,
      });

      console.log("Answer sent");
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  };

  const handleAnswer = async (data) => {
    console.log("Received answer");

    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data) => {
    console.log("Received ICE candidate");

    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const updateVideoVolume = (volume) => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
    setVideoVolume(volume);
  };

  const updateCallVolume = (volume) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = volume;
    }
    setCallVolume(volume);
  };

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = callVolume;
    }
  }, [callVolume]);

  useEffect(() => {
    const video = videoRef.current;
    const socket = socketRef.current;
    if (!video || !roomId || !socket) return;

    let isRemoteAction = false;

    console.log("Video sync system initialized for room:", roomId);

    const handlePlay = () => {
      if (isRemoteAction) return;

      console.log("LOCAL PLAY at", video.currentTime);

      socket.emit("play", {
        roomId,
        time: video.currentTime,
      });
    };

    const handlePause = () => {
      if (isRemoteAction) return;

      console.log("LOCAL PAUSE at", video.currentTime);

      socket.emit("pause", {
        roomId,
        time: video.currentTime,
      });
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    const handleRemotePlay = (time) => {
      console.log("REMOTE PLAY received at", time);

      isRemoteAction = true;
      video.currentTime = time;

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Remote play successful");
            setTimeout(() => {
              isRemoteAction = false;
            }, 100);
          })
          .catch((error) => {
            console.log("Remote play failed:", error);
            isRemoteAction = false;
          });
      }
    };

    const handleRemotePause = (time) => {
      console.log("REMOTE PAUSE received at", time);

      isRemoteAction = true;
      video.currentTime = time;
      video.pause();

      setTimeout(() => {
        isRemoteAction = false;
      }, 100);
    };

    socket.on("play", handleRemotePlay);
    socket.on("pause", handleRemotePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      socket.off("play", handleRemotePlay);
      socket.off("pause", handleRemotePause);
    };
  }, [roomId]);

  return (
    <div style={{ padding: 20, position: "relative" }}>
      <h1>Watch Room</h1>

      <p>
        <strong>Room ID:</strong> {roomId || "No room selected"}
      </p>

      <video
        ref={videoRef}
        width="600"
        height="600"
        style={{
          width: "600px",
          height: "600px",
          objectFit: "cover",
          backgroundColor: "#000",
        }}
        controls
      >
        <source src="/sample.mp4" type="video/mp4" />
        Your browser does not support video.
      </video>

      <div
        style={{
          position: "absolute",
          top: "80px",
          left: "20px",
          backgroundColor: "rgba(0,0,0,0.8)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
        }}
      >
        <h4 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>Volume Controls</h4>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            🎬 Video Volume: {Math.round(videoVolume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={videoVolume}
            onChange={(e) => updateVideoVolume(parseFloat(e.target.value))}
            style={{ width: "150px" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "5px" }}>
            📞 Call Volume: {Math.round(callVolume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={callVolume}
            onChange={(e) => updateCallVolume(parseFloat(e.target.value))}
            style={{ width: "150px" }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "80px",
          right: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div>
          <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#666" }}>
            You
          </p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            style={{
              width: "150px",
              height: "150px",
              objectFit: "cover",
              backgroundColor: "#333",
              borderRadius: "8px",
              border: "2px solid #4CAF50",
            }}
          />
        </div>

        <div>
          <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#666" }}>
            Friend {remoteStreamActive ? "🟢" : "🔴"}
          </p>
          <div style={{ position: "relative" }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              style={{
                width: "150px",
                height: "150px",
                objectFit: "cover",
                backgroundColor: "#333",
                borderRadius: "8px",
                border: remoteStreamActive ? "2px solid #2196F3" : "2px solid #f44336",
              }}
            />
            {!remoteStreamActive && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  color: "#fff",
                  fontSize: "12px",
                  textAlign: "center",
                }}
              >
                Waiting for friend...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
