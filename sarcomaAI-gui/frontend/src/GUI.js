import React, { useState, useEffect } from 'react';
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Slider } from "./components/ui/slider";
import { ScrollArea } from "./components/ui/scroll-area";

const scans = [
  { name: "InPhase", path: "T1DUAL/DICOM_anon/InPhase" },
  { name: "OutPhase", path: "T1DUAL/DICOM_anon/OutPhase" },
  { name: "T2SPIR", path: "T2SPIR/DICOM_anon" }
];

export default function T1T2Selector() {
  const [currentScanIdx, setCurrentScanIdx] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [selectedT1, setSelectedT1] = useState(null);
  const [selectedT2, setSelectedT2] = useState(null);

  const currentScan = scans[currentScanIdx];

  const handleSelect = (type) => {
    if (type === 'T1') setSelectedT1(currentScan.path);
    if (type === 'T2') setSelectedT2(currentScan.path);
  };

  const handleNext = () => {
    // Save to CSV (call backend API)
    fetch('/api/save-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: '8',
        t1: selectedT1,
        t2: selectedT2
      })
    });

    // Reset for next patient
    setSelectedT1(null);
    setSelectedT2(null);
    setCurrentScanIdx(0);
    setSliceIndex(0);
  };

  return (
    <div className="flex h-screen">
      <ScrollArea className="w-1/4 border-r p-4">
        <h2 className="font-bold mb-4">Scans</h2>
        {scans.map((scan, idx) => (
          <Button key={scan.path} onClick={() => setCurrentScanIdx(idx)} variant={idx === currentScanIdx ? "default" : "outline"} className="w-full mb-2">
            {scan.name}
          </Button>
        ))}
      </ScrollArea>

      <div className="flex-1 p-6">
        <h1 className="text-xl font-bold mb-4">Viewing: {currentScan.name}</h1>

        <Card className="mb-4">
          <CardContent className="flex justify-center items-center h-96 bg-black">
            <span className="text-white">Slice Viewer Placeholder (Slice {sliceIndex})</span>
          </CardContent>
        </Card>

        <Slider min={0} max={72} value={[sliceIndex]} onValueChange={(val) => setSliceIndex(val[0])} className="mb-6" />

        <div className="flex space-x-4 mb-6">
          <Button onClick={() => handleSelect('T1')} disabled={!!selectedT1}>
            {selectedT1 === currentScan.path ? "Selected as T1" : "Select as T1"}
          </Button>
          <Button onClick={() => handleSelect('T2')} disabled={!!selectedT2}>
            {selectedT2 === currentScan.path ? "Selected as T2" : "Select as T2"}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={!selectedT1 || !selectedT2}>
            Save and Next Patient
          </Button>
        </div>
      </div>
    </div>
  );
}
