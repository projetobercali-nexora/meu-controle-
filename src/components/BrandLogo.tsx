import React, { useState } from 'react';

export const BERCALI_LOGO_PATH = '/assets/aistudio/file_00000000d4ac8243a4a41ff6e2cc5b63_b707e5fc.png';
export const BERCALI_BRAND_MANUAL_PDF = '/assets/aistudio/Manual_de_Marca_Bercali_Store_fe245d34.pdf';

interface BrandLogoProps {
  variant?: 'sidebar' | 'login' | 'card';
  className?: string;
}

/**
 * Componente oficial do logótipo Bercali Store.
 * Respeita rigorosamente o Manual de Marca v1.0:
 * - Não estica, não comprime, não inclina e não altera cores ou elementos.
 * - Mantém área de proteção (padding) e largura mínima digital >= 120px quando completo.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'sidebar', className = '' }) => {
  const [imgError, setImgError] = useState(false);

  const containerStyles =
    variant === 'login'
      ? 'w-[164px] p-3 bg-white rounded-[10px] border border-[#E5E5E5]'
      : variant === 'card'
        ? 'w-[144px] p-2.5 bg-white rounded-[10px] border border-[#E5E5E5]'
        : 'w-[132px] p-2 bg-white rounded-[10px]';

  if (imgError) {
    return (
      <div className={`inline-flex flex-col items-center justify-center bg-[#0A0A0A] px-4 py-3 rounded-[10px] ${className}`}>
        <span className="font-brand italic font-extrabold text-xl text-white tracking-tight">
          Bercal<span className="text-[#FF8A00]">i</span>
        </span>
        <span className="font-brand font-medium text-[10px] tracking-[0.22em] text-[#FF8A00]">
          STORE
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center shrink-0 ${containerStyles} ${className}`}>
      <img
        src={BERCALI_LOGO_PATH}
        alt="Logótipo oficial Bercali Store — O futuro das compras começa aqui."
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-auto object-contain select-none"
      />
    </div>
  );
};

/**
 * Linhas de velocidade oficiais (Manual de Marca pág. 11 - Elemento gráfico 01):
 * Duas ou três linhas horizontais em laranja e âmbar com pontas arredondadas.
 */
export const BercaliSpeedLines: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center gap-1.5 ${className}`} aria-hidden="true">
    <span className="h-1 w-8 rounded-full bg-[#FF8A00]" />
    <span className="h-1 w-4 rounded-full bg-[#FFC400]" />
    <span className="h-1 w-2 rounded-full bg-[#FF8A00]/70" />
  </div>
);
