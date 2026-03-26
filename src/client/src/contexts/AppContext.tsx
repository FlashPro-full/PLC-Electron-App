import { createContext } from "react";

type AppContextType = {
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
}

export const AppContext = createContext<AppContextType | null>(null);