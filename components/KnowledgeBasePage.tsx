import React, { useEffect, useRef } from 'react';
import { User } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { EyeIcon } from './icons/EyeIcon';
import { UsersIcon } from './icons/UsersIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { GlobeIcon } from './icons/GlobeIcon';
import { DollarSignIcon } from './icons/DollarSignIcon';
import { LogoIcon } from './icons/LogoIcon';

const knowledgeContent = [
  {
    icon: <EyeIcon className="h-8 w-8 text-green-400" />,
    title: "The Vision: The Rise of the Common People",
    text: "We were not born into privilege. We are the builders, the teachers, the mothers, the vendors, the farmers, the unemployed graduates  the ordinary majority who make the nation function yet are treated as invisible.\n\nFor too long, our systems have rewarded the few who manipulate power rather than the many who produce real value. Banks lend to the rich. Governments promise but forget. The people the commons  are left fighting for survival in a game they never designed.\n\nUbuntium Global Commons exists to correct that. It is the financial and moral awakening of the common people a system that gives back to those who feed it, that rewards participation, that ensures no one goes hungry, and that turns necessity itself into wealth.\n\nWe are not asking for permission. We are building our own economy  one that works because it serves us."
  },
  {
    icon: <UsersIcon className="h-8 w-8 text-green-400" />,
    title: "The Philosophy: Escaping the Tragedy of the Commons",
    text: "Economists once spoke of the “Tragedy of the Commons” the idea that shared resources are doomed to be exploited because everyone acts for themselves.\n\nBut that tragedy only exists when there is no trust, no vision, and no structure. We, the people, are writing a new chapter:\n\nThe Triumph of the Commons  where shared resources create shared abundance.\n\nIn the Ubuntium Global Commons, the common person is not the victim  they are the architect. Every member holds $UBT, which represents real ownership rights in the Commons. Holding at least $10 worth of $UBT is not a donation it is a stake in a new kind of economy, a share in a living system that feeds, protects, and enriches its people.\n\nThe tragedy ends when the commons become self-aware  when we realise we are not poor, just unorganised. And now, we are organising globally, intelligently, and irreversibly."
  },
  {
    icon: <BriefcaseIcon className="h-8 w-8 text-green-400" />,
    title: "The Failure of Institutions: And the Logic That Sustains Them",
    text: "The old system reproduces itself by design. It needs inequality to survive. It teaches us that the poor must wait, that change must come from above, that progress belongs to the connected few.\n\nGovernments change, currencies collapse, yet the system remains because it was never meant for us.\n\nWe, the common people, are the very fuel of that system. We buy, we work, we produce yet the flow of value always escapes upward. Ubuntium Global Commons interrupts that flow and redirects it back to its source: the people themselves.\n\nFor the first time, the majority become the system. Our hunger becomes our reason to unite. Our transactions create our own economy. And our token  $UBT becomes the proof that we have taken control of value itself."
  },
  {
    icon: <GlobeIcon className="h-8 w-8 text-green-400" />,
    title: "The Model: A System That Feeds the People",
    text: "Every two months, members of the Global Commons receive food hampers  a compulsory benefit ensuring that no member of the Commons ever goes hungry. This is not charity; it is a guaranteed return of value to the base that sustains the system.\n\nBeyond that, the Commons responds to distress calls — emergencies such as school fees, funerals, or medical bills  verified through community networks. We also receive business proposals from members whose ideas can scale and feed back into the Commons. When we fund these projects, their success strengthens the whole ecosystem  the wealth they create flows back to the people.\n\nIt is an economy of circulation, not extraction. A living cycle of support → creation → reinvestment.\n\nNo banks. No politicians. Just people, organised around shared value."
  },
  {
    icon: <DollarSignIcon className="h-8 w-8 text-green-400" />,
    title: "The Economics: Why $UBT Is the People’s Asset Class",
    text: "$UBT is not speculation  it is participation. It is the asset class of necessity, tied directly to real-world demand: food, emergencies, small business, and daily life.\n\nAs more members join and use the system, demand for $UBT grows  because access to the Commons requires it. That demand increases its value over time, meaning that the longer you hold your stake, the more valuable your ownership becomes.\n\nAnd here’s the beauty:\n\nYou can exit at any time. You can leave the Commons whenever you wish, and if you’ve been part of its growth, you can even exit at the top  with your $UBT worth more than when you entered.\n\nNo one loses here. No one is trapped. You are free to come, grow, and go and your value follows you.\n\nThat is financial freedom made real."
  },
  {
    icon: <LogoIcon className="h-8 w-8 text-green-400" />,
    title: "The Legacy: The Birth of a New Order",
    text: "We are the generation that will end economic dependence and institutional deceit. We are not the elite, yet we are the essential. We feed the system  and now, we have built one that feeds us.\n\nThe Ubuntium Global Commons is not a company. It is not a foundation. It is a living social organism  a system that grows stronger as its people grow.\n\nIn time, $UBT will become the most valuable asset class in Zimbabwe  not because of speculation, but because it represents the very heartbeat of human necessity. When the world realises that the power of wealth lies not in scarcity but in shared trust, Ubuntium will stand as proof.\n\nThis is not charity. This is not politics. This is the rebirth of economic dignity."
  }
];

interface KnowledgeBasePageProps {
  currentUser: User;
  onUpdateUser: (updatedData: Partial<User>) => Promise<void>;
}

export const KnowledgeBasePage: React.FC<KnowledgeBasePageProps> = ({ currentUser, onUpdateUser }) => {
    const { addToast } = useToast();
    const sentinelRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !currentUser.hasReadKnowledgeBase) {
                    api.awardKnowledgePoints(currentUser.id).then(wasAwarded => {
                        if (wasAwarded) {
                            addToast('Congratulations! You earned 10 knowledge points.', 'success');
                            onUpdateUser({
                                hasReadKnowledgeBase: true,
                                knowledgePoints: (currentUser.knowledgePoints || 0) + 10
                            });
                        }
                    });
                    observer.disconnect(); // Only fire once per page load.
                }
            },
            { threshold: 0.9 }
        );

        const currentSentinel = sentinelRef.current;
        if (currentSentinel) {
            observer.observe(currentSentinel);
        }

        return () => {
            if (currentSentinel) {
                observer.unobserve(currentSentinel);
            }
        };
    }, [currentUser, addToast, onUpdateUser]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in space-y-8">
            <div className="text-center p-6 bg-slate-800 rounded-lg">
                <BookOpenIcon className="h-16 w-16 mx-auto text-green-400 mb-4" />
                <h1 className="text-3xl font-bold text-white">UBUNTIUM GLOBAL COMMONS</h1>
                <p className="text-lg text-green-400 mt-1">The Knowledge That Liberates the Common People</p>
                {currentUser.hasReadKnowledgeBase && (
                    <div className="mt-4 text-sm bg-slate-700/50 text-green-300 p-3 rounded-md inline-block">
                        You've earned 10 knowledge points for reviewing this material. Welcome back!
                    </div>
                )}
            </div>

            {knowledgeContent.map((item, index) => (
                <div key={index} className="bg-slate-800 p-6 rounded-lg shadow-lg flex flex-col sm:flex-row items-start gap-6">
                    <div className="flex-shrink-0 bg-slate-700 p-4 rounded-full">
                        {item.icon}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-white mb-2">{item.title}</h2>
                        <p className="text-gray-300 whitespace-pre-line leading-relaxed">{item.text}</p>
                    </div>
                </div>
            ))}

            <div ref={sentinelRef} className="text-center p-8 text-slate-600 italic">
                the commons protect those who protects the commons
            </div>
        </div>
    );
};
