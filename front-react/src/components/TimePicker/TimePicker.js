import { useState, useEffect } from 'react';
import styles from './TimePicker.module.css';

export default function TimePicker({ value, onChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState(value || '00:00');
  const [hours, minutes] = selectedTime.split(':').map(Number);

  // Gerar arrays de horas e minutos
  const hoursArray = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutesArray = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Abrir modal
  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  // Selecionar hora
  const handleHourSelect = (hour) => {
    const newTime = `${hour}:${minutes.toString().padStart(2, '0')}`;
    setSelectedTime(newTime);
  };

  // Selecionar minuto
  const handleMinuteSelect = (minute) => {
    const newTime = `${hours.toString().padStart(2, '0')}:${minute}`;
    setSelectedTime(newTime);
  };

  // Confirmar seleção
  const handleConfirm = () => {
    onChange(selectedTime);
    setIsOpen(false);
  };

  // Cancelar
  const handleCancel = () => {
    setSelectedTime(value || '00:00');
    setIsOpen(false);
  };

  // Efeito para sincronizar com prop value
  useEffect(() => {
    setSelectedTime(value || '00:00');
  }, [value]);

  return (
    <>
      {/* Input que abre o modal */}
      <input
        type="text"
        value={value || ''}
        onClick={handleOpen}
        readOnly
        placeholder="00:00"
        disabled={disabled}
        className={styles.timeInput}
      />

      {/* Modal */}
      {isOpen && (
        <div className={styles.modalOverlay} onClick={handleCancel}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <button onClick={handleCancel} className={styles.cancelButton}>
                Cancel
              </button>
              <h3>Select Time</h3>
              <button onClick={handleConfirm} className={styles.confirmButton}>
                Confirm
              </button>
            </div>

            {/* Time Picker */}
            <div className={styles.timePickerContainer}>
              {/* Preview do horário selecionado */}
              <div className={styles.timePreview}>
                {selectedTime}
              </div>

              {/* Seletores de Hora e Minuto */}
              <div className={styles.selectorsContainer}>
                {/* Coluna de Horas */}
                <div className={styles.column}>
                  <div className={styles.columnLabel}>Hour</div>
                  <div className={styles.optionsContainer}>
                    {hoursArray.map((hour) => (
                      <button
                        key={hour}
                        className={`${styles.option} ${hours.toString().padStart(2, '0') === hour ? styles.selected : ''}`}
                        onClick={() => handleHourSelect(hour)}
                      >
                        {hour}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Separador */}
                <div className={styles.separator}>:</div>

                {/* Coluna de Minutos */}
                <div className={styles.column}>
                  <div className={styles.columnLabel}>Minute</div>
                  <div className={styles.optionsContainer}>
                    {minutesArray.map((minute) => (
                      <button
                        key={minute}
                        className={`${styles.option} ${minutes.toString().padStart(2, '0') === minute ? styles.selected : ''}`}
                        onClick={() => handleMinuteSelect(minute)}
                      >
                        {minute}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
