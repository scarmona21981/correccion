export interface ElectronAPI {
    openFile: () => Promise<{ path: string; content: string } | null>;
    loadProject: (filePath: string) => Promise<{ path: string; content: string } | null>;
    saveFile: (path: string, content: string) => Promise<boolean>;
    saveFileAs: (content: string) => Promise<string | null>;
    exitApp: () => Promise<void>;

    // Splash Screen
    sendLoadingProgress: (progress: number, message: string) => void;
    sendAppReady: () => void;
    onLoadingProgress: (callback: (event: any, data: { progress: number; message: string }) => void) => void;

    // Window close handling
    onCheckUnsavedChanges: (callback: () => void) => () => void;
    sendUnsavedChangesResponse: (hasChanges: boolean) => void;
    onSaveAndClose: (callback: () => void) => () => void;
    sendSaveCompleted: () => void;
    onOpenProject: (callback: (path: string) => void) => () => void;

    openPopout: (payload: { view: string; selection?: Record<string, unknown>; snapshotJson?: string; analysisSnapshotJson?: string }) => Promise<{ windowId: string }>;
    closePopout: (windowId: string) => Promise<boolean>;
    closeAllPopouts: () => Promise<boolean>;
    listPopouts: () => Promise<string[]>;
    getPopoutInit: (windowId: string) => Promise<{ windowId?: string; view?: string; selection?: Record<string, unknown> | null } | null>;
    getPopoutRestoreOnStartup: () => Promise<boolean>;
    setPopoutRestoreOnStartup: (enabled: boolean) => Promise<boolean>;

    sendProjectSnapshot: (payload: { snapshotJson: string; sourceWindowId: string }) => void;
    getLatestProjectSnapshot: () => Promise<string | null>;
    onProjectSnapshot: (callback: (payload: { snapshotJson: string; sourceWindowId: string; ts: number }) => void) => () => void;
    sendAnalysisSnapshot: (payload: { snapshotJson: string; sourceWindowId: string }) => void;
    getLatestAnalysisSnapshot: () => Promise<string | null>;
    onAnalysisSnapshot: (callback: (payload: { snapshotJson: string; sourceWindowId: string; ts: number }) => void) => () => void;
    onPopoutInit: (callback: (payload: { windowId?: string; view?: string; selection?: Record<string, unknown> | null }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
        api?: {
            onOpenProject: (callback: (path: string) => void) => () => void;
        };
    }
}

export { };
