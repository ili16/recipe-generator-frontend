let mediaRecorder;
let audioChunks = [];
let recording = false;
let audioStream = null;

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleRecordingBtn");
  const retryBtn = document.getElementById("retryRecordingBtn");
  const submitBtn = document.getElementById("submitVoiceBtn");
  const audioElement = document.getElementById("audioPlayback");
  const voiceInput = document.getElementById("voice");

  toggleBtn.addEventListener("click", async () => {
    if (!recording) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const mimeType = mediaRecorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          const file = new File([audioBlob], "recording.webm", { type: mimeType });
        
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          voiceInput.files = dataTransfer.files;
        
          audioElement.src = URL.createObjectURL(audioBlob);
          audioElement.hidden = false;
          retryBtn.hidden = false;
          submitBtn.disabled = false;
        
          if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
          }
        };

        mediaRecorder.start(1000); // fixes decoding error for recording on iOS
        toggleBtn.textContent = "⏹ Aufnahme stoppen";
        recording = true;
      } catch (error) {
        alert("Mikrofon-Zugriff verweigert oder nicht verfügbar.");
        console.error("Fehler beim Zugriff auf das Mikrofon:", error);
      }
    } else {
      mediaRecorder.stop();
      toggleBtn.textContent = "🎤 Aufnahme starten";
      recording = false;
    }
  });

  retryBtn.addEventListener("click", () => {
    audioElement.hidden = true;
    retryBtn.hidden = true;
    submitBtn.disabled = true;
    voiceInput.value = "";
  });
});
