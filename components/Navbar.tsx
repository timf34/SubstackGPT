import { ExternalLink } from "lucide-react";
import { FC } from "react";

interface NavbarProps {
    authorName?: string;
    substackUrl?: string;
}

export const Navbar: FC<NavbarProps> = ({ authorName, substackUrl }) => {
    return (
        <div className="flex h-[60px] border-b border-gray-300 py-2 px-8 items-center justify-between">
            <div className="font-bold text-2xl flex items-center">
                <a
                    className="hover:opacity-50"
                    href="/"
                >
                    {authorName ? `${authorName} GPT` : 'Substack GPT'}
                </a>
            </div>
            <div>
                {substackUrl && (
                    <a
                        className="flex items-center hover:opacity-50"
                        href={substackUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="hidden sm:flex">Visit Substack</div>
                        <ExternalLink
                            className="ml-1"
                            size={20}
                        />
                    </a>
                )}
            </div>
        </div>
    );
};

export default Navbar;