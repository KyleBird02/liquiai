import React, { createContext, useContext, ReactNode } from "react";
import { useAlert } from "@/hooks/useAlert";
import { AlertModal, AlertConfig } from "@/components/AlertModal";

interface AlertContextType {
  show: (config: AlertConfig) => void;
  alert: (title: string, message: string, type?: AlertConfig["type"]) => void;
  confirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void,
  ) => void;
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
  warning: (
    title: string,
    message: string,
    onConfirm?: () => void | Promise<void>,
    onCancel?: () => void,
  ) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const alert = useAlert();

  const value: AlertContextType = {
    show: alert.show,
    alert: alert.alert,
    confirm: alert.confirm,
    success: alert.success,
    error: alert.error,
    warning: alert.warning,
  };

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(AlertContext.Provider, { value }, children),
    React.createElement(AlertModal, {
      isOpen: alert.isOpen,
      config: alert.config,
      onClose: alert.close,
    }),
  );
};

export const useAlertContext = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlertContext must be used within an AlertProvider");
  }
  return context;
};
