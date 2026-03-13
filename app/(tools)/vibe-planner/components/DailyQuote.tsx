'use client';

import { useState, useEffect } from 'react';

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", emoji: "🚀", author: "Mark Twain" },
  { text: "Small steps every day lead to big changes.", emoji: "🪜", author: "" },
  { text: "You don't have to be perfect to be amazing.", emoji: "✨", author: "" },
  { text: "Done is better than perfect.", emoji: "💪", author: "Sheryl Sandberg" },
  { text: "Your future self will thank you.", emoji: "🙏", author: "" },
  { text: "Focus on progress, not perfection.", emoji: "📈", author: "" },
  { text: "One vibe at a time.", emoji: "🎯", author: "" },
  { text: "The best time to start was yesterday. The next best time is now.", emoji: "⏰", author: "" },
  { text: "Dream big. Start small. Act now.", emoji: "💡", author: "Robin Sharma" },
  { text: "Believe you can and you're halfway there.", emoji: "🌟", author: "Theodore Roosevelt" },
  { text: "What you do today can improve all your tomorrows.", emoji: "🌅", author: "Ralph Marston" },
  { text: "It always seems impossible until it's done.", emoji: "🏔️", author: "Nelson Mandela" },
  { text: "You are capable of amazing things.", emoji: "🦋", author: "" },
  { text: "Every accomplishment starts with the decision to try.", emoji: "🎬", author: "" },
  { text: "Make today so awesome, yesterday gets jealous.", emoji: "😎", author: "" },
  { text: "Your only limit is your mind.", emoji: "🧠", author: "" },
  { text: "Consistency beats intensity.", emoji: "🔥", author: "" },
  { text: "Turn your can'ts into cans and your dreams into plans.", emoji: "📝", author: "" },
  { text: "The journey of a thousand miles begins with a single step.", emoji: "👣", author: "Lao Tzu" },
  { text: "Be the energy you want to attract.", emoji: "⚡", author: "" },
  { text: "You're doing better than you think.", emoji: "💜", author: "" },
  { text: "Keep going. Everything you need will come to you.", emoji: "🌊", author: "" },
  { text: "Great things never come from comfort zones.", emoji: "🎢", author: "" },
  { text: "Today is a good day to have a good day.", emoji: "☀️", author: "" },
  { text: "Progress is progress, no matter how small.", emoji: "🐢", author: "" },
  { text: "Spark it. Plan it. Do it.", emoji: "✦", author: "" },
  { text: "You didn't come this far to only come this far.", emoji: "🏃", author: "" },
  { text: "Inhale confidence, exhale doubt.", emoji: "🧘", author: "" },
  { text: "What feels overwhelming today will feel easy tomorrow.", emoji: "🌈", author: "" },
  { text: "Your vibes attract your tribe.", emoji: "🤝", author: "" },
  { text: "Less thinking, more doing.", emoji: "⚡", author: "" },
  // Telugu quotes
  { text: "ప్రయత్నం చేస్తే ఫలితం తప్పక వస్తుంది.", emoji: "🪷", author: "" },
  { text: "మీరు మారితే ప్రపంచం మారుతుంది.", emoji: "🌍", author: "మహాత్మా గాంధీ" },
  { text: "కష్టపడితే సుఖపడతారు.", emoji: "💎", author: "" },
  { text: "నేడు చేయగలిగింది రేపటికి వాయిదా వేయకు.", emoji: "⏳", author: "" },
  { text: "విజయం అనేది ప్రయాణం, గమ్యం కాదు.", emoji: "🛤️", author: "" },
  { text: "ఆలోచన మారితే జీవితం మారుతుంది.", emoji: "🧠", author: "" },
  { text: "ధైర్యం ఉంటే దారి తప్పక దొరుకుతుంది.", emoji: "🦁", author: "" },
  { text: "చిన్న చిన్న అడుగులే పెద్ద మార్పులకు దారి తీస్తాయి.", emoji: "👣", author: "" },
  { text: "మీలో ఉన్న శక్తిని నమ్మండి.", emoji: "💪", author: "" },
  { text: "నీ కలలను నీవే నిజం చేసుకో.", emoji: "🌠", author: "" },
  { text: "ఓటమి అంటే ముగింపు కాదు, కొత్త మొదలు.", emoji: "🌱", author: "" },
  { text: "నీ పని నిన్ను నిర్వచిస్తుంది.", emoji: "🔨", author: "" },
  { text: "ఎప్పుడూ నేర్చుకుంటూ ఉండు, ఎదగడం ఆపకు.", emoji: "📚", author: "" },
  { text: "సమయం విలువైనది, దాన్ని వృధా చేయకు.", emoji: "⏰", author: "" },
  { text: "ఆనందంగా ఉండటం నీ చేతిలోనే ఉంది.", emoji: "😊", author: "" },
];

export default function DailyQuote() {
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  return (
    <div className="mb-4 py-3 px-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center animate-fade-in">
      <p className="text-[15px] text-[var(--muted)] leading-relaxed">
        <span className="mr-1.5">{quote.emoji}</span>
        <span className="italic">{quote.text}</span>
        {quote.author && (
          <span className="text-[12px] text-[var(--dim)] ml-2">— {quote.author}</span>
        )}
      </p>
    </div>
  );
}
