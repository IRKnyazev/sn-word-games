/**
 * Plugin view root. Full-screen, finger only.
 * @format
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Puzzles</Text>
      <Pressable
        style={styles.button}
        onPress={() => PluginManager.closePluginView()}>
        <Text style={styles.buttonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  title: {fontSize: 32, fontWeight: '600', color: '#000000'},
  button: {
    marginTop: 24,
    borderWidth: 2,
    borderColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {fontSize: 22, color: '#000000'},
});

export default App;
