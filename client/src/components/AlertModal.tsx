import React from "react";

export interface AlertConfig {
  type: "info" | "success" | "warning" | "error" | "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface AlertModalProps {
  isOpen: boolean;
  config: AlertConfig | null;
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  config,
  onClose,
}) => {
  const [isLoading, setIsLoading] = React.useState(false);

  if (!isOpen || !config) return null;

  const getIconAndColors = () => {
    switch (config.type) {
      case "success":
        return {
          icon: "✅",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-900",
          buttonColor: "bg-green-600 hover:bg-green-700",
          accentColor: "text-green-600",
        };
      case "error":
        return {
          icon: "❌",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-900",
          buttonColor: "bg-red-600 hover:bg-red-700",
          accentColor: "text-red-600",
        };
      case "warning":
        return {
          icon: "⚠️",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          textColor: "text-yellow-900",
          buttonColor: "bg-yellow-600 hover:bg-yellow-700",
          accentColor: "text-yellow-600",
        };
      case "confirm":
        return {
          icon: "❓",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          textColor: "text-blue-900",
          buttonColor: "bg-blue-600 hover:bg-blue-700",
          accentColor: "text-blue-600",
        };
      case "info":
      default:
        return {
          icon: "ℹ️",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          textColor: "text-blue-900",
          buttonColor: "bg-blue-600 hover:bg-blue-700",
          accentColor: "text-blue-600",
        };
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      if (config.onConfirm) {
        await config.onConfirm();
      }
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  const handleCancel = () => {
    if (config.onCancel) {
      config.onCancel();
    }
    onClose();
  };

  const colors = getIconAndColors();
  const isConfirmType = config.type === "confirm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        className={`${colors.bgColor} ${colors.borderColor} border rounded-lg shadow-lg p-6 max-w-sm w-full mx-4`}
      >
        {/* Icon */}
        <div className="text-4xl text-center mb-4">{colors.icon}</div>

        {/* Title */}
        <h2
          className={`text-lg font-bold text-center ${colors.textColor} mb-2`}
        >
          {config.title}
        </h2>

        {/* Message */}
        <p
          className={`text-sm text-center ${colors.textColor} mb-6 leading-relaxed`}
        >
          {config.message}
        </p>

        {/* Actions */}
        <div
          className={`flex gap-3 ${
            isConfirmType ? "justify-end" : "justify-center"
          }`}
        >
          {isConfirmType && (
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {config.cancelLabel || "Cancel"}
            </button>
          )}

          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`${colors.buttonColor} px-4 py-2 text-sm font-medium text-white rounded-md transition disabled:opacity-50 inline-flex items-center gap-2`}
          >
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Processing...
              </>
            ) : (
              config.confirmLabel || (isConfirmType ? "Confirm" : "OK")
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
