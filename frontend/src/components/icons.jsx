// PriceWatch icon set — inline SVG, copied from design/_chrome.jsx
// 18×18 default, all accept size prop where noted

export const Ico = ({ d, size = 18, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={stroke}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

export const IcoHome      = () => <Ico d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1Z" />
export const IcoSearch    = () => <Ico d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3" />
export const IcoCompare   = () => <Ico d="M4 6h6m0 12H4M14 6h6m0 12h-6M9 4v16M15 4v16" />
export const IcoCalendar  = () => <Ico d="M4 7h16v13H4zM4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M8 3v4M16 3v4M4 11h16" />
export const IcoBell      = () => <Ico d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 10a2 2 0 0 0 4 0" />
export const IcoChart     = () => <Ico d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
export const IcoTrend     = () => <Ico d="M3 17 9 11l4 4 8-9M21 6h-5M21 6v5" />
export const IcoReport    = () => <Ico d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v5h5M9 13h8M9 17h6M9 9h3" />
export const IcoSparkles  = () => <Ico d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 14l.6 1.7L7.3 16l-1.7.6L5 18l-.6-1.7L2.7 16l1.7-.6L5 14Z" />
export const IcoGear      = () => <Ico d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8.5 3a8.5 8.5 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a8.4 8.4 0 0 0-2.3-1.3L15.5 3h-4l-.3 2.4a8.4 8.4 0 0 0-2.3 1.3l-2.3-.9-2 3.4 2 1.5a8.5 8.5 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9c.7.5 1.5 1 2.3 1.3l.3 2.4h4l.3-2.4c.8-.3 1.6-.8 2.3-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3Z" />
export const IcoUser      = () => <Ico d="M4 21a8 8 0 0 1 16 0M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
export const IcoLock      = () => <Ico d="M6 11h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9ZM9 11V8a3 3 0 0 1 6 0v3" />
export const IcoArrow     = () => <Ico d="M5 12h14M13 6l6 6-6 6" />
export const IcoArrowL    = () => <Ico d="M19 12H5M11 18l-6-6 6-6" />
export const IcoUp        = ({ size = 14 }) => <Ico size={size} d="M12 19V5M5 12l7-7 7 7" />
export const IcoDown      = ({ size = 14 }) => <Ico size={size} d="M12 5v14M19 12l-7 7-7-7" />
export const IcoChevR     = ({ size = 14 }) => <Ico size={size} d="m9 6 6 6-6 6" />
export const IcoChevD     = ({ size = 14 }) => <Ico size={size} d="m6 9 6 6 6-6" />
export const IcoClock     = () => <Ico d="M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" />
export const IcoPlus      = ({ size = 14 }) => <Ico size={size} d="M12 5v14M5 12h14" />
export const IcoFilter    = () => <Ico d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />
export const IcoTag       = () => <Ico d="M3 12 12 3h8v8l-9 9-8-8Zm12-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
export const IcoCheck     = ({ size = 14 }) => <Ico size={size} d="M5 12.5 10 17l9-11" />
export const IcoX         = ({ size = 14 }) => <Ico size={size} d="M6 6l12 12M6 18 18 6" />
export const IcoBox       = () => <Ico d="M21 8 12 3 3 8v8l9 5 9-5V8Zm0 0-9 5m0 0L3 8m9 5v9" />
export const IcoFlag      = () => <Ico d="M4 21V4h13l-2 4 2 4H4" />
export const IcoExt       = () => <Ico d="M14 3h7v7M21 3l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
export const IcoDownload  = () => <Ico d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" />
export const IcoCopy      = ({ size = 14 }) => <Ico size={size} d="M8 8h11v13H8zM5 4h11v4H8a0 0 0 0 0 0 0v0M5 4v13" />
export const IcoSend      = () => <Ico d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
export const IcoSettings  = IcoGear
export const IcoSparkle   = () => <Ico d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
export const IcoBot       = () => <Ico d="M7 9h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Zm5-4v4M9 14h.01M15 14h.01M9 17h6" />
export const IcoMap       = () => <Ico d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />
export const IcoFolder    = () => <Ico d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
export const IcoLightning = () => <Ico d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
export const IcoEye       = () => <Ico d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
export const IcoGrid      = () => <Ico d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
export const IcoList      = () => <Ico d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
export const IcoTrash     = ({ size = 14 }) => <Ico size={size} d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
export const IcoEdit      = ({ size = 14 }) => <Ico size={size} d="M4 20h4l11-11-4-4L4 16v4ZM14 6l4 4" />
