"use client";

import { useEffect, useRef, useState } from "react";

// 앱 안에서 카메라를 열어 영수증을 찍는다. 찍은 장면은 메모리(Blob)로만 넘기고
// 휴대폰 갤러리·Drive 어디에도 파일을 만들지 않는다.

const MAX_SIDE = 2000;

type Props = { onCapture: (image: Blob) => void; onClose: () => void; onUnavailable: (message: string) => void };

export function ReceiptCamera({ onCapture, onClose, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null); // null = 지원 안 함

  useEffect(() => {
    let cancelled = false;
    const stop = () => streamRef.current?.getTracks().forEach((t) => t.stop());
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailable("이 브라우저에서는 카메라를 열 수 없습니다. '이미지로 읽기'를 써 주세요.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setReady(true);
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        if (caps?.torch) setTorch(false);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        onUnavailable(
          name === "NotAllowedError"
            ? "카메라 권한이 막혀 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 카메라를 허용해 주세요."
            : name === "NotFoundError"
              ? "카메라를 찾지 못했습니다. '이미지로 읽기'를 써 주세요."
              : "카메라를 열지 못했습니다.",
        );
      }
    })();
    // 화면을 닫으면 카메라도 끈다
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {}
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.85,
    );
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="영수증 촬영">
      <video ref={videoRef} playsInline muted autoPlay />
      <div className="camera-guide" aria-hidden>
        <span>영수증을 테두리 안에 맞춰 주세요</span>
      </div>
      <div className="camera-bar">
        <button className="btn" onClick={onClose}>
          닫기
        </button>
        <button className="shutter" onClick={capture} disabled={!ready} aria-label="촬영" />
        {torch !== null ? (
          <button className="btn" onClick={toggleTorch} aria-pressed={torch}>
            {torch ? "플래시 끄기" : "플래시"}
          </button>
        ) : (
          <span className="camera-spacer" />
        )}
      </div>
    </div>
  );
}
