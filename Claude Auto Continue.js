// ==UserScript==
// @name         Claude Message Scheduler
// @namespace    http://tampermonkey.net/
// @version      4.1
// @match        https://claude.ai/*
// @match        https://*.claude.ai/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log("🔥 Claude Message Scheduler v4.1 loaded");

    let statusBox = null;
    let countdownTimer = null;
    let executionTimer = null;

    function formatRemaining(ms) {
        let totalSeconds = Math.max(0, Math.floor(ms / 1000));

        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;

        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }

        if (hours >= 1) {
            return `${hours}h ${minutes}m ${seconds}s`;
        }

        return `${minutes}m ${seconds}s`;
    }

    function getNextRun(hour, minute) {
        const now = new Date();
        const target = new Date();

        target.setHours(hour, minute, 0, 0);

        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }

        return target;
    }

    function getDefaultTime() {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 5);

        return (
            String(d.getHours()).padStart(2, '0') +
            ':' +
            String(d.getMinutes()).padStart(2, '0')
        );
    }

    function sendMessage(text) {

        const editor = document.querySelector('[contenteditable="true"]');

        if (!editor) {
            console.log("❌ Editor not found");
            return;
        }

        editor.focus();

        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);

        editor.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text
        }));

        setTimeout(() => {

            const sendButton = [...document.querySelectorAll('button')]
                .find(btn => {
                    const label =
                        btn.ariaLabel ||
                        btn.getAttribute('aria-label') ||
                        '';

                    return label.toLowerCase().includes('send');
                });

            if (sendButton) {
                sendButton.click();
                console.log(`📤 Sent: "${text}"`);
            } else {
                console.log("❌ Send button not found");
            }

        }, 800);
    }

    function ensureStatusBox() {

        if (statusBox) return;

        statusBox = document.createElement('div');

        statusBox.style.position = 'fixed';
        statusBox.style.bottom = '20px';
        statusBox.style.right = '20px';
        statusBox.style.background = 'rgba(0,0,0,0.85)';
        statusBox.style.color = 'white';
        statusBox.style.padding = '12px';
        statusBox.style.borderRadius = '10px';
        statusBox.style.fontFamily = 'monospace';
        statusBox.style.zIndex = '999999';
        statusBox.style.minWidth = '280px';
        statusBox.style.lineHeight = '1.5';
        statusBox.style.boxShadow = '0 0 10px rgba(0,0,0,0.4)';

        document.body.appendChild(statusBox);
    }

    function showSetupDialog() {

        const overlay = document.createElement('div');

        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.6)';
        overlay.style.zIndex = '1000000';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        overlay.innerHTML = `
            <div style="
                background:#111;
                color:white;
                padding:20px;
                border-radius:12px;
                font-family:monospace;
                width:340px;
            ">
                <h3 style="margin-top:0;">
                    ⏰ Scheduler Setup
                </h3>

                <div style="font-size:12px; opacity:0.8; margin-bottom:8px;">
                    Time (24h format)
                </div>

                <div style="font-size:12px; margin-bottom:6px;">
                    Examples: 03:10 • 15:45 • 09:05
                </div>

                <input id="schedulerTime"
                    value="${getDefaultTime()}"
                    style="
                        width:100%;
                        padding:8px;
                        margin-bottom:12px;
                        border-radius:6px;
                        border:1px solid #444;
                        background:black;
                        color:white;
                        box-sizing:border-box;
                    "
                />

                <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
                    Message to send
                </div>

                <input id="schedulerMessage"
                    value="Continue"
                    style="
                        width:100%;
                        padding:8px;
                        margin-bottom:12px;
                        border-radius:6px;
                        border:1px solid #444;
                        background:black;
                        color:white;
                        box-sizing:border-box;
                    "
                />

                <button id="schedulerStart"
                    style="
                        width:100%;
                        padding:10px;
                        background:green;
                        color:white;
                        border:none;
                        border-radius:6px;
                        cursor:pointer;
                    ">
                    Start
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('schedulerStart').onclick = () => {

            const timeValue =
                document.getElementById('schedulerTime').value.trim();

            const messageValue =
                document.getElementById('schedulerMessage').value.trim() ||
                'Continue';

            const parts = timeValue.split(':');

            if (parts.length !== 2) {
                alert('Invalid time format. Use HH:MM');
                return;
            }

            const hour = parseInt(parts[0], 10);
            const minute = parseInt(parts[1], 10);

            if (
                isNaN(hour) ||
                isNaN(minute) ||
                hour < 0 ||
                hour > 23 ||
                minute < 0 ||
                minute > 59
            ) {
                alert('Invalid time');
                return;
            }

            overlay.remove();

            startSchedule(hour, minute, messageValue);
        };
    }

    function startSchedule(hour, minute, message) {

        ensureStatusBox();

        if (countdownTimer) {
            clearInterval(countdownTimer);
        }

        if (executionTimer) {
            clearTimeout(executionTimer);
        }

        const target = getNextRun(hour, minute);

        function updateStatus() {

            const remaining = target - new Date();

            statusBox.innerHTML = `
                ⏳ Scheduler Running<br>
                Target: ${target.toLocaleString()}<br>
                Message: ${message}<br>
                Remaining: ${formatRemaining(remaining)}
            `;
        }

        updateStatus();

        countdownTimer = setInterval(() => {

            const remaining = target - new Date();

            if (remaining <= 0) {
                clearInterval(countdownTimer);
                return;
            }

            updateStatus();

        }, 1000);

        executionTimer = setTimeout(() => {

            clearInterval(countdownTimer);

            statusBox.innerHTML = `
                🚀 Triggering...<br>
                Message: ${message}
            `;

            sendMessage(message);

            setTimeout(() => {

                statusBox.innerHTML = `
                    ✅ Sent<br>
                    Time: ${new Date().toLocaleString()}<br>
                    Message: ${message}<br><br>

                    <button id="scheduleAnotherBtn"
                       style="
                       width:100%;
                       padding:10px;
                       background:green;
                       color:white;
                       border:none;
                       border-radius:6px;
                       cursor:pointer;
                     ">
                        Schedule Another
                     </button>
                `;

                document
                    .getElementById('scheduleAnotherBtn')
                    .onclick = showSetupDialog;

            }, 1000);

        }, target - new Date());
    }

    showSetupDialog();

})();
