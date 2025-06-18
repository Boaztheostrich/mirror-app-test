import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Hide tab bar completely
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mirror',
          tabBarButton: () => null, // Remove tab button
        }}
      />
    </Tabs>
  );
}