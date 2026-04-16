import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Track users per room
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    // initialize room if not exists
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    rooms[roomId].push(socket.id);

    console.log(`Room ${roomId} users:`, rooms[roomId]);

    // Notify others in the room
    socket.to(roomId).emit("user-joined");

    // Send current room size
    io.to(roomId).emit("room-users", rooms[roomId].length);
  });

  // PLAY EVENT
  socket.on("play", ({ roomId, time }) => {
    console.log(`PLAY from ${socket.id} at ${time}`);

    // Send to everyone else in the room
    socket.to(roomId).emit("play", time);
  });

  // PAUSE EVENT
  socket.on("pause", ({ roomId, time }) => {
    console.log(`PAUSE from ${socket.id} at ${time}`);

    socket.to(roomId).emit("pause", time);
  });

  // WEBRTC SIGNALING EVENTS
  
  // Offer event
  socket.on("offer", ({ roomId, offer }) => {
    console.log(`OFFER from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit("offer", {
      offer,
      from: socket.id
    });
  });

  // Answer event
  socket.on("answer", ({ roomId, answer }) => {
    console.log(`ANSWER from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit("answer", {
      answer,
      from: socket.id
    });
  });

  // ICE candidate event
  socket.on("ice-candidate", ({ roomId, candidate }) => {
    console.log(`ICE CANDIDATE from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit("ice-candidate", {
      candidate,
      from: socket.id
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(
        (id) => id !== socket.id
      );

      // Notify remaining users
      io.to(roomId).emit("room-users", rooms[roomId].length);

      // Optional: clean empty rooms
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

httpServer.listen(3002, () => {
  console.log("Socket server running on port 3002");
});