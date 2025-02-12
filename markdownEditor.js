document.addEventListener("DOMContentLoaded", function () {
    const markdownEditor = document.getElementById("markdownEditor");
    const contentArea = document.getElementById("contentArea");
  
    function toggleEditor() {
      const editorContainer = document.getElementById("editorContainer");
      if (editorContainer.style.display === "none") {
        editorContainer.style.display = "block"; // Show editor
      } else {
        editorContainer.style.display = "none"; // Hide editor
      }
    }
  
    function updatePreview() {
      contentArea.innerHTML = marked.parse(markdownEditor.value);
    }
  
    function acceptFunction() {
      console.log("Accepted Content:", markdownEditor.value);
      closeBox();
    }
  
    function closeBox() {
      document.getElementById("overlay").style.display = "none";
    }
  
    // Live preview when typing
    markdownEditor.addEventListener("input", updatePreview);
  
    // Expose functions globally
    window.toggleEditor = toggleEditor;
    window.acceptFunction = acceptFunction;
    window.closeBox = closeBox;
  });
  