const canvas = document.getElementById('waveCanvas');
const ctx = canvas.getContext('2d');
const colorPaletteSelect = document.getElementById('colorPalette');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let waveOffset = 0;

// Color palettes
const palettes = {
    sunset: ['#FF5F6D', '#FFC371'],
    ocean: ['#00C6FF', '#0072FF'],
    pastel: ['#FFB6B9', '#FAE3D9', '#BBE1FA']
};

let currentPalette = palettes.sunset;

// Draw waves
function drawWaves() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = currentPalette[0];
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        const y = Math.sin((x + waveOffset) * 0.01) * 50 + canvas.height / 2;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = currentPalette[1];
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        const y = Math.sin((x + waveOffset + Math.PI) * 0.01) * 50 + canvas.height / 2 + 20;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    waveOffset += 2;
    requestAnimationFrame(drawWaves);
}

// Handle mouse interaction
canvas.addEventListener('mousemove', (e) => {
    const rippleX = e.clientX;
    const rippleY = e.clientY;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(rippleX, rippleY, 50, 0, Math.PI * 2);
    ctx.fill();
});

// Change color palette
colorPaletteSelect.addEventListener('change', (e) => {
    const selectedPalette = e.target.value;
    currentPalette = palettes[selectedPalette];
});

// Start drawing waves
drawWaves();
