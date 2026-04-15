import { useState, useCallback } from "react";
import { AlertConfig } from "@/components/AlertModal";

export const useAlert = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);

  const show = useCallback((alertConfig: AlertConfig) => {
    setConfig(alertConfig);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setConfig(null);
  }, []);

  const alert = useCallback(
    (title: string, message: string, type: AlertConfig["type"] = "info") => {
      show({
        type,
        title,
        message,
        confirmLabel: "OK",
      });
    },
    [show],
  );

  const confirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      onCancel?: () => void,
    ) => {
      show({
        type: "confirm",
        title,
        message,
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        onConfirm,
        onCancel,
      });
    },
    [show],
  );

  const success = useCallback(
    (title: string, message: string) => {
      alert(title, message, "success");
    },
    [alert],
  );

  const error = useCallback(
    (title: string, message: string) => {
      alert(title, message, "error");
    },
    [alert],
  );

  const warning = useCallback(
    (
      title: string,
      message: string,
      onConfirm?: () => void | Promise<void>,
      onCancel?: () => void,
    ) => {
      show({
        type: "warning",
        title,
        message,
        confirmLabel: "Proceed",
        cancelLabel: "Cancel",
        onConfirm,
        onCancel,
      });
    },
    [show],
  );

  return {
    isOpen,
    config,
    close,
    show,
    alert,
    confirm,
    success,
    error,
    warning,
  };
};
