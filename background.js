const MENU_ID = "search-song-youtube";

async function findFirstYouTubeVideoId(query) {
  const searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(/"videoRenderer"\s*:\s*\{"videoId":"([^"]+)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("YouTube search lookup failed:", error);
    return null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Play on YouTube",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;

  const query = info.selectionText.trim();
  if (!query || !tab?.id || !tab.url) return;

  try {
    const pageUrl = new URL(tab.url);
    if (!["http:", "https:"].includes(pageUrl.protocol)) return;
  } catch {
    return;
  }

  const videoId = await findFirstYouTubeVideoId(query);
  if (!videoId) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (youTubeVideoId, selectedText) => {
      const playerId = "search-song-mini-player";
      let player = document.getElementById(playerId);

      if (!player) {
        player = document.createElement("div");
        player.id = playerId;
        Object.assign(player.style, {
          position: "fixed",
          right: "20px",
          bottom: "20px",
          width: "360px",
          maxWidth: "calc(100vw - 24px)",
          height: "220px",
          background: "rgba(15, 15, 18, 0.72)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(0, 0, 0, 0.45)",
          zIndex: "2147483647",
          userSelect: "none",
          WebkitUserSelect: "none",
          cursor: "default",
          opacity: "0.75",
          touchAction: "none",
          transition: "opacity 0.2s ease",
          resize: "none"
        });

        player.addEventListener("mouseenter", () => {
          player.style.opacity = "1";
          player.style.pointerEvents = "auto";
        });

        player.addEventListener("mouseleave", () => {
          player.style.opacity = "0.75";
          player.style.pointerEvents = "auto";
        });

        const titleBar = document.createElement("div");
        Object.assign(titleBar.style, {
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "26px",
          padding: "0 8px 0 10px",
          fontSize: "11px",
          fontWeight: "600",
          color: "#fff",
          background: "rgb(34, 34, 34)",
          cursor: "grab",
          userSelect: "none",
          lineHeight: "26px",
          pointerEvents: "auto"
        });

        const createResizeHandle = (edge) => {
          const handle = document.createElement("div");
          handle.dataset.edge = edge;

          if (edge === "left") {
            Object.assign(handle.style, {
              position: "absolute",
              left: "0",
              top: "0",
              width: "8px",
              height: "100%",
              cursor: "ew-resize",
              background: "transparent",
              pointerEvents: "auto"
            });
          }

          if (edge === "right") {
            Object.assign(handle.style, {
              position: "absolute",
              right: "0",
              top: "0",
              width: "8px",
              height: "100%",
              cursor: "ew-resize",
              background: "transparent",
              pointerEvents: "auto"
            });
          }

          if (edge === "bottom") {
            Object.assign(handle.style, {
              position: "absolute",
              left: "0",
              bottom: "0",
              width: "100%",
              height: "8px",
              cursor: "ns-resize",
              background: "transparent",
              pointerEvents: "auto"
            });
          }

          if (edge === "bottom-left") {
            Object.assign(handle.style, {
              position: "absolute",
              left: "0",
              bottom: "0",
              width: "8px",
              height: "8px",
              cursor: "nesw-resize",
              background: "transparent",
              pointerEvents: "auto"
            });
          }

          if (edge === "bottom-right") {
            Object.assign(handle.style, {
              position: "absolute",
              right: "0",
              bottom: "0",
              width: "8px",
              height: "8px",
              cursor: "nwse-resize",
              background: "transparent",
              pointerEvents: "auto"
            });
          }

          return handle;
        };

        const resizeHandles = ["left", "right", "bottom", "bottom-left", "bottom-right"].map(createResizeHandle);
        resizeHandles.forEach((handle) => player.appendChild(handle));

        const title = document.createElement("span");
        title.style.flex = "1";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";

        const closeButton = document.createElement("button");
        closeButton.textContent = "✕";
        Object.assign(closeButton.style, {
          background: "transparent",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          fontSize: "13px",
          padding: "0 4px",
          lineHeight: "1",
          marginLeft: "8px"
        });

        closeButton.addEventListener("click", () => player.remove());

        titleBar.appendChild(title);
        titleBar.appendChild(closeButton);

        const iframe = document.createElement("iframe");
        iframe.title = "YouTube player";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        Object.assign(iframe.style, {
          width: "100%",
          height: "calc(100% - 26px)",
          border: "0",
          display: "block",
          background: "#000"
        });

        player.appendChild(titleBar);
        player.appendChild(iframe);

        let resizing = false;
        let resizeEdge = null;
        let startRect = null;

        const stopResizing = () => {
          resizing = false;
          resizeEdge = null;
          startRect = null;
          document.body.style.userSelect = "";
          document.body.style.webkitUserSelect = "";
          document.body.style.cursor = "";
          document.documentElement.style.userSelect = "";
          document.documentElement.style.webkitUserSelect = "";
        };

        const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

        const handleResizeMove = (event) => {
          if (!resizing || !resizeEdge || !startRect) return;

          event.preventDefault();
          document.body.style.userSelect = "none";
          document.body.style.webkitUserSelect = "none";
          document.documentElement.style.userSelect = "none";
          document.documentElement.style.webkitUserSelect = "none";

          if (resizeEdge === "left") {
            const nextLeft = clamp(event.clientX, 8, startRect.right - 220);
            const nextWidth = startRect.right - nextLeft;
            player.style.left = `${nextLeft}px`;
            player.style.right = "auto";
            player.style.width = `${clamp(nextWidth, 220, window.innerWidth - 24)}px`;
          }

          if (resizeEdge === "right") {
            const nextWidth = clamp(event.clientX - startRect.left, 220, window.innerWidth - startRect.left - 8);
            player.style.width = `${nextWidth}px`;
          }

          if (resizeEdge === "bottom") {
            const nextHeight = clamp(event.clientY - startRect.top, 120, window.innerHeight - startRect.top - 8);
            player.style.height = `${nextHeight}px`;
          }

          if (resizeEdge === "bottom-left") {
            const nextLeft = clamp(event.clientX, 8, startRect.right - 220);
            const nextWidth = startRect.right - nextLeft;
            const nextHeight = clamp(event.clientY - startRect.top, 120, window.innerHeight - startRect.top - 8);
            player.style.left = `${nextLeft}px`;
            player.style.right = "auto";
            player.style.width = `${clamp(nextWidth, 220, window.innerWidth - 24)}px`;
            player.style.height = `${nextHeight}px`;
          }

          if (resizeEdge === "bottom-right") {
            const nextWidth = clamp(event.clientX - startRect.left, 220, window.innerWidth - startRect.left - 8);
            const nextHeight = clamp(event.clientY - startRect.top, 120, window.innerHeight - startRect.top - 8);
            player.style.width = `${nextWidth}px`;
            player.style.height = `${nextHeight}px`;
          }
        };

        resizeHandles.forEach((handle) => {
          handle.addEventListener("pointerdown", (event) => {
            resizing = true;
            resizeEdge = handle.dataset.edge;
            startRect = player.getBoundingClientRect();
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
            document.body.style.userSelect = "none";
            document.body.style.webkitUserSelect = "none";
            document.body.style.cursor = handle.style.cursor || "default";
            document.documentElement.style.userSelect = "none";
            document.documentElement.style.webkitUserSelect = "none";
          });
        });

        document.addEventListener("pointerdown", (event) => {
          if (resizeHandles.includes(event.target)) {
            event.preventDefault();
          }
        }, true);

        document.addEventListener("pointermove", handleResizeMove);
        document.addEventListener("pointerup", stopResizing);
        document.addEventListener("pointercancel", stopResizing);

        const root = document.body || document.documentElement;
        if (root) {
          root.appendChild(player);
        }

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const startDragging = (event) => {
          if (event.target === closeButton || resizeHandles.includes(event.target)) return;
          dragging = true;
          title.setPointerCapture(event.pointerId);
          const rect = player.getBoundingClientRect();
          offsetX = event.clientX - rect.left;
          offsetY = event.clientY - rect.top;
          title.style.cursor = "grabbing";
        };

        titleBar.addEventListener("pointerdown", startDragging);
        title.addEventListener("pointerdown", startDragging);

        title.addEventListener("pointermove", (event) => {
          if (!dragging) return;

          const nextLeft = Math.min(
            window.innerWidth - player.offsetWidth - 8,
            Math.max(8, event.clientX - offsetX)
          );
          const nextTop = Math.min(
            window.innerHeight - player.offsetHeight - 8,
            Math.max(8, event.clientY - offsetY)
          );

          player.style.left = `${nextLeft}px`;
          player.style.right = "auto";
          player.style.top = `${nextTop}px`;
          player.style.bottom = "auto";
        });

        const stopDragging = () => {
          dragging = false;
          title.style.cursor = "grab";
        };

        title.addEventListener("pointerup", stopDragging);
        title.addEventListener("pointerleave", stopDragging);
        title.addEventListener("pointercancel", stopDragging);

        const onEscape = (event) => {
          if (event.key === "Escape") {
            player.remove();
            document.removeEventListener("keydown", onEscape);
          }
        };
        document.addEventListener("keydown", onEscape);

        player.__closeButton = closeButton;
      }

      const iframe = player.querySelector("iframe");
      iframe.src = `https://www.youtube.com/embed/${youTubeVideoId}?autoplay=1&controls=1&playsinline=1&rel=0`;
      iframe.title = "YouTube player";

      const title = player.querySelector("span");
      title.textContent = selectedText;

      if (player.__closeButton) {
        player.__closeButton.onclick = () => player.remove();
      }
    },
    args: [videoId, query]
  });
});