import { IconBrandGithub, IconBrandTwitter } from "@tabler/icons-react";
import { FC } from "react";

export const Footer: FC = () => {
  return (
    <div className="flex h-[50px] border-t border-gray-300 py-2 px-8 items-center sm:justify-between justify-center bg-gradient-to-r from-transparent via-gray-50 to-transparent">
      <div className="hidden sm:flex"></div>

      <div className="hidden sm:flex items-center text-sm text-gray-600">
        Created by
        <a
          className="mx-1 relative group"
          href="https://timfarrelly.com"
          target="_blank"
          rel="noreferrer"
        >
          <span className="font-medium text-gray-800 transition-colors duration-200 ease-in-out hover:text-blue-600">
            Tim Farrelly
          </span>
          <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-blue-600 transition-all duration-200 group-hover:w-full"></span>
        </a>
      </div>

      <div className="flex space-x-6">
        <a
          className="flex items-center transition-transform duration-200 hover:scale-110 hover:text-blue-600"
          href="https://x.com/TimFarrelly8"
          target="_blank"
          rel="noreferrer"
          aria-label="Twitter"
        >
          <IconBrandTwitter size={22} />
        </a>

        <a
          className="flex items-center transition-transform duration-200 hover:scale-110 hover:text-blue-600"
          href="https://github.com/timf34/SubstackGPT"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <IconBrandGithub size={22} />
        </a>
      </div>
    </div>
  );
};
