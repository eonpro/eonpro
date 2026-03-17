import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';

type CalcType = 'bmi' | 'calories' | 'macros' | null;

export default function CalculatorsScreen() {
  const colors = useBrandColors();
  const features = usePortalFeatures();
  const router = useRouter();
  const [activeCalc, setActiveCalc] = useState<CalcType>(null);

  // BMI
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [bmiWeight, setBmiWeight] = useState('');
  const [bmiResult, setBmiResult] = useState<number | null>(null);

  // Calories
  const [age, setAge] = useState('');
  const [calWeight, setCalWeight] = useState('');
  const [calResult, setCalResult] = useState<number | null>(null);

  function calcBMI() {
    const ft = parseInt(heightFt); const inches = parseInt(heightIn); const w = parseFloat(bmiWeight);
    if (isNaN(ft) || isNaN(w)) { Alert.alert('Invalid', 'Enter valid height and weight.'); return; }
    const totalInches = ft * 12 + (isNaN(inches) ? 0 : inches);
    const bmi = (w / (totalInches * totalInches)) * 703;
    setBmiResult(Math.round(bmi * 10) / 10);
  }

  function calcCalories() {
    const a = parseInt(age); const w = parseFloat(calWeight);
    if (isNaN(a) || isNaN(w)) { Alert.alert('Invalid', 'Enter valid age and weight.'); return; }
    // Mifflin-St Jeor (simplified, assumes moderate activity)
    const bmr = 10 * (w * 0.453592) + 6.25 * 170 - 5 * a + 5; // rough estimate
    setCalResult(Math.round(bmr * 1.55));
  }

  function getBMICategory(bmi: number): { label: string; color: string } {
    if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6' };
    if (bmi < 25) return { label: 'Normal', color: '#10B981' };
    if (bmi < 30) return { label: 'Overweight', color: '#F59E0B' };
    return { label: 'Obese', color: '#EF4444' };
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => activeCalc ? setActiveCalc(null) : router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Calculators</Text>

        {!activeCalc && (
          <View className="px-5 flex-row flex-wrap gap-3">
            {features.showBMICalculator && (
              <CalcCard label="BMI" emoji="📊" desc="Body Mass Index" color="#DBEAFE" textColor="#2563EB"
                onPress={() => setActiveCalc('bmi')} />
            )}
            {features.showCalorieCalculator && (
              <CalcCard label="Calories" emoji="🔥" desc="Daily needs" color="#FEF3C7" textColor="#D97706"
                onPress={() => setActiveCalc('calories')} />
            )}
            <CalcCard label="Macros" emoji="🥩" desc="Protein, carbs, fat" color="#D1FAE5" textColor="#047857"
              onPress={() => setActiveCalc('macros')} />
          </View>
        )}

        {/* BMI Calculator */}
        {activeCalc === 'bmi' && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-lg font-semibold text-gray-900 mb-4">BMI Calculator</Text>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Height</Text>
            <View className="flex-row gap-3 mb-3">
              <View className="flex-1">
                <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="Feet" placeholderTextColor="#9CA3AF" value={heightFt} onChangeText={setHeightFt} keyboardType="number-pad" />
              </View>
              <View className="flex-1">
                <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="Inches" placeholderTextColor="#9CA3AF" value={heightIn} onChangeText={setHeightIn} keyboardType="number-pad" />
              </View>
            </View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Weight (lbs)</Text>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
              placeholder="e.g. 180" placeholderTextColor="#9CA3AF" value={bmiWeight} onChangeText={setBmiWeight} keyboardType="decimal-pad" />
            <TouchableOpacity onPress={calcBMI} className="rounded-xl py-3.5 items-center" style={{ backgroundColor: colors.primary }}>
              <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Calculate</Text>
            </TouchableOpacity>
            {bmiResult !== null && (
              <View className="mt-4 items-center">
                <Text className="text-3xl font-bold" style={{ color: getBMICategory(bmiResult).color }}>{bmiResult}</Text>
                <Text className="text-sm font-medium mt-1" style={{ color: getBMICategory(bmiResult).color }}>
                  {getBMICategory(bmiResult).label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Calorie Calculator */}
        {activeCalc === 'calories' && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-lg font-semibold text-gray-900 mb-4">Calorie Calculator</Text>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Age</Text>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="e.g. 35" placeholderTextColor="#9CA3AF" value={age} onChangeText={setAge} keyboardType="number-pad" />
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Weight (lbs)</Text>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
              placeholder="e.g. 180" placeholderTextColor="#9CA3AF" value={calWeight} onChangeText={setCalWeight} keyboardType="decimal-pad" />
            <TouchableOpacity onPress={calcCalories} className="rounded-xl py-3.5 items-center" style={{ backgroundColor: colors.primary }}>
              <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Calculate</Text>
            </TouchableOpacity>
            {calResult !== null && (
              <View className="mt-4 items-center">
                <Text className="text-3xl font-bold" style={{ color: colors.primary }}>{calResult}</Text>
                <Text className="text-sm text-gray-500 mt-1">calories/day (moderate activity)</Text>
              </View>
            )}
          </View>
        )}

        {/* Macros (simplified) */}
        {activeCalc === 'macros' && calResult && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-lg font-semibold text-gray-900 mb-4">Macro Breakdown</Text>
            <Text className="text-sm text-gray-500 mb-4">Based on {calResult} cal/day</Text>
            <View className="gap-3">
              <MacroRow label="Protein" grams={Math.round(calResult * 0.3 / 4)} percent={30} color="#3B82F6" />
              <MacroRow label="Carbs" grams={Math.round(calResult * 0.4 / 4)} percent={40} color="#F59E0B" />
              <MacroRow label="Fat" grams={Math.round(calResult * 0.3 / 9)} percent={30} color="#EF4444" />
            </View>
          </View>
        )}
        {activeCalc === 'macros' && !calResult && (
          <View className="mx-5 bg-white rounded-2xl p-8 shadow-sm items-center">
            <Text className="text-sm text-gray-500">Calculate your daily calories first to see macro breakdown.</Text>
            <TouchableOpacity onPress={() => setActiveCalc('calories')} className="mt-3 rounded-lg px-4 py-2" style={{ backgroundColor: colors.primaryLight }}>
              <Text className="text-sm font-medium" style={{ color: colors.primary }}>Go to Calorie Calculator</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CalcCard({ label, emoji, desc, color, textColor, onPress }: {
  label: string; emoji: string; desc: string; color: string; textColor: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} className="rounded-2xl p-5" style={{ backgroundColor: color, width: '47%' }}>
      <Text style={{ fontSize: 28 }}>{emoji}</Text>
      <Text className="text-base font-semibold mt-2" style={{ color: textColor }}>{label}</Text>
      <Text className="text-xs mt-0.5" style={{ color: textColor, opacity: 0.7 }}>{desc}</Text>
    </TouchableOpacity>
  );
}

function MacroRow({ label, grams, percent, color }: { label: string; grams: number; percent: number; color: string }) {
  return (
    <View>
      <View className="flex-row justify-between mb-1">
        <Text className="text-sm font-medium text-gray-900">{label}</Text>
        <Text className="text-sm text-gray-600">{grams}g ({percent}%)</Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
