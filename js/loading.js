function showLoading() {
    let overlay = document.getElementById('overlay');
    let spinner = document.getElementById('loadingSpinner');
  
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'overlay';
      overlay.style.display = 'flex';
  
      spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.id = 'loadingSpinner';
  
      overlay.appendChild(spinner);
      document.body.appendChild(overlay);
    } else {
      overlay.style.display = 'flex';
      spinner.style.display = 'block';
    }
  
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
  }
  
  function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
  
    if (overlay && spinner) {
      spinner.style.display = 'none';
      document.body.style.overflow = '';
      document.body.style.pointerEvents = 'auto';
    }
  }
  