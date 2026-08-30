import React from 'react';
import { View, ActivityIndicator, StyleSheet, Modal, Text } from 'react-native';

interface LoadingProps {
  visible: boolean;
  message?: string;
}

const Loading: React.FC<LoadingProps> = ({ visible, message }) => {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#ff3333" />
          {message && <Text style={styles.message}>{message}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#111',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 150,
    borderWidth: 2,
    borderColor: '#ff3333',
  },
  message: {
    marginTop: 15,
    fontSize: 16,
    color: '#fff',
  },
});

export default Loading;
