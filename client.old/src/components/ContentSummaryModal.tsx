import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Languages, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ContentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentName: string;
  summary: string;
  tags?: string[];
}

type Language = 'original' | 'thai' | 'english' | 'chinese';

const languageLabels = {
  original: 'Original',
  thai: 'ไทย (Thai)',
  english: 'English',
  chinese: '中文 (Chinese)'
};

export default function ContentSummaryModal({ 
  isOpen, 
  onClose, 
  documentId,
  documentName, 
  summary, 
  tags 
}: ContentSummaryModalProps) {
  const { toast } = useToast();
  const [currentLanguage, setCurrentLanguage] = useState<Language>('original');
  const [translations, setTranslations] = useState<Record<Language, string>>({
    original: summary,
    thai: '',
    english: '',
    chinese: ''
  });

  const translateMutation = useMutation({
    mutationFn: async (targetLanguage: Language) => {
      if (targetLanguage === 'original') return summary;
      
      let targetLang = '';
      switch (targetLanguage) {
        case 'thai':
          targetLang = 'Thai';
          break;
        case 'english':
          targetLang = 'English';
          break;
        case 'chinese':
          targetLang = 'Chinese (Simplified)';
          break;
      }

      console.log(`Requesting translation for document ${documentId} to ${targetLang}`);
      
      const response = await apiRequest('POST', `/api/documents/${documentId}/translate`, {
        targetLanguage: targetLang
      });
      
      const result = await response.json();
      console.log('Translation response:', result);
      
      return result.translatedText;
    },
    onSuccess: (translatedText, targetLanguage) => {
      setTranslations(prev => ({
        ...prev,
        [targetLanguage]: translatedText
      }));
      setCurrentLanguage(targetLanguage);
    },
    onError: (error) => {
      toast({
        title: "Translation Error",
        description: error.message || "Failed to translate content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLanguageChange = (language: Language) => {
    if (language === 'original') {
      setCurrentLanguage('original');
      return;
    }

    // If translation already exists, use it
    if (translations[language]) {
      setCurrentLanguage(language);
      return;
    }

    // Otherwise, fetch translation
    translateMutation.mutate(language);
  };

  const getCurrentContent = () => {
    return translations[currentLanguage] || summary;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5" />
            <span>Content Summary</span>
          </DialogTitle>
          <DialogDescription>
            AI-generated summary of {documentName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Language Selection */}
          <div className="flex items-center space-x-3">
            <Languages className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Language:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(languageLabels).map(([lang, label]) => (
                <Button
                  key={lang}
                  variant={currentLanguage === lang ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleLanguageChange(lang as Language)}
                  disabled={translateMutation.isPending}
                  className="text-xs"
                >
                  {translateMutation.isPending && translateMutation.variables === lang && (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Summary Content */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Summary ({languageLabels[currentLanguage]})
            </h4>
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {getCurrentContent()}
              </p>
            </div>
          </div>

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Related Tags</h4>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Translation Notice */}
          {currentLanguage !== 'original' && (
            <div className="text-xs text-gray-500 italic">
              Note: This is an AI-generated translation. The accuracy may vary.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}